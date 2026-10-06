/**
 * Wave 4 parent QA gates G1-G7 (pi-herdr-pstack docs/plans/14-wave4-contract.md).
 *
 * Real Herdr, real Pi, deterministic scripted provider. These prove host
 * mechanics only (launch, delivery, cancel, worktrees, caller_ping, nesting),
 * never model obedience. Scenarios are registered with `registerScenario` in
 * fake-provider.ts; each parent/child pair is recognised by `W4_PARENT:` and
 * `W4_CHILD:` markers carried in the prompts.
 *
 * Evidence is written under $W4_EVIDENCE_DIR (default /tmp/w4-gates-logs/evidence).
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	rmdirSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { isString } from "../../maestro/core/config/type-guards.ts";
import {
	getProviderRequests,
	registerScenario,
	resetProviderRequests,
	type ProviderRequest,
	type ResponsePlan,
	type ScenarioContext,
	type ToolCallArguments,
} from "./fake-provider.ts";
import {
	cleanupTestEnv,
	createTestEnv,
	createTrackedSurface,
	getAvailableBackends,
	PI_TIMEOUT,
	readPane,
	restoreBackend,
	setBackend,
	shellQuote,
	sleep,
	startPi,
	uniqueId,
	waitForPaneReady,
	type TestEnv,
} from "./harness.ts";

const EVIDENCE = process.env.W4_EVIDENCE_DIR ?? "/tmp/w4-gates-logs/evidence";

// ── Session entries ──

// The session-entry fields these gates read; JSON.parse supplies the rest.
type ContentPart = {
	type?: string;
	text?: string;
	name?: string;
	arguments?: ToolCallArguments;
};

type Entry = {
	type?: string;
	customType?: string;
	timestamp?: string;
	content?: any;
	details?: any;
	message?: {
		role?: string;
		toolName?: string;
		isError?: boolean;
		content?: any;
	};
};

function readEntries(path: string): Entry[] {
	if (!existsSync(path)) return [];
	const entries: Entry[] = [];
	for (const line of readFileSync(path, "utf8").split("\n")) {
		if (!line) continue;
		try {
			entries.push(JSON.parse(line));
		} catch {
			// A partial trailing line is still being written.
		}
	}
	return entries;
}

const custom = (entries: Entry[], type: string) =>
	entries.filter((e) => e.type === "custom_message" && e.customType === type);
const results = (entries: Entry[]) => custom(entries, "subagent_result");
const resultFor = (entries: Entry[], name: string) =>
	results(entries).filter((e) => e.details?.name === name);

/** Tool calls the assistant made, in order, with the entry index. */
function assistantToolCalls(entries: Entry[]) {
	return entries.flatMap((entry, index) =>
		entry.type === "message" && entry.message?.role === "assistant"
			? (Array.isArray(entry.message.content) ? entry.message.content : [])
					.filter((part: ContentPart) => part.type === "toolCall")
					.map((part: ContentPart) => ({
						index,
						name: part.name ?? "",
						arguments: part.arguments ?? {},
					}))
			: [],
	);
}

function toolResults(entries: Entry[], toolName: string) {
	return entries.filter(
		(e) =>
			e.type === "message" &&
			e.message?.role === "toolResult" &&
			e.message?.toolName === toolName,
	);
}

const textOf = (content: ContentPart[] | string | undefined): string =>
	Array.isArray(content)
		? content.map((part) => part.text ?? "").join("\n")
		: (content ?? "");

async function waitFor<T>(
	probe: () => T | undefined | false,
	what: string,
	timeout = PI_TIMEOUT,
): Promise<T> {
	const deadline = Date.now() + timeout;
	for (;;) {
		const value = probe();
		if (value) return value;
		if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
		await sleep(100);
	}
}

async function waitForExists(
	path: string,
	timeout = PI_TIMEOUT,
): Promise<void> {
	await waitFor(() => existsSync(path), `file ${path}`, timeout);
}

function herdrJson(...args: string[]): any {
	return JSON.parse(execFileSync("herdr", args, { encoding: "utf8" }));
}

function workspacePanes(workspaceId: string): string[] {
	try {
		return herdrJson(
			"pane",
			"list",
			"--workspace",
			workspaceId,
		).result.panes.map((pane: { pane_id: string }) => pane.pane_id);
	} catch {
		return [];
	}
}

function pgrepCount(pattern: string): number {
	try {
		return execFileSync("pgrep", ["-f", "--", pattern], { encoding: "utf8" })
			.split("\n")
			.filter(Boolean).length;
	} catch {
		return 0;
	}
}

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function initRepo(dir: string): string {
	git(dir, "init", "-q", "-b", "main");
	git(dir, "config", "user.email", "test@example.com");
	git(dir, "config", "user.name", "Integration Test");
	git(dir, "config", "commit.gpgsign", "false");
	writeFileSync(join(dir, "README.md"), "wave4 gate fixture\n");
	writeFileSync(join(dir, ".gitignore"), ".pi/\n");
	git(dir, "add", "README.md", ".gitignore");
	git(dir, "commit", "-qm", "fixture");
	return git(dir, "rev-parse", "HEAD");
}

// ── Scenario scripting ──

const isParent = (ctx: ScenarioContext, id: string, gate: string) =>
	!ctx.tools.includes("caller_ping") &&
	ctx.tools.includes("subagent") &&
	ctx.allText.includes(`W4_PARENT:${id}:${gate}`);

/** A child's own launch message is its first user message. */
function childName(ctx: ScenarioContext, id: string): string | undefined {
	if (!ctx.tools.includes("caller_ping")) return undefined;
	return ctx.userTexts[0]?.match(new RegExp(`W4_CHILD:${id}:(\\S+)`))?.[1];
}

function childRequests(id: string, name: string): ProviderRequest[] {
	return getProviderRequests().filter(
		(r) =>
			r.status === 200 &&
			r.tools?.includes("caller_ping") &&
			r.userTexts?.[0]?.includes(`W4_CHILD:${id}:${name} `),
	);
}

const bash = (command: string): ResponsePlan => ({
	toolCalls: [{ name: "bash", arguments: { command } }],
});

const launch = (args: ToolCallArguments) => ({
	name: "subagent",
	arguments: { model: "pi-integration/test", thinking: "minimal", ...args },
});

describe("wave4 gates [herdr]", { timeout: PI_TIMEOUT * 12 }, () => {
	if (getAvailableBackends().length === 0) {
		it("requires real Herdr (no skip counts as a pass)", () => {
			assert.fail("herdr is unavailable; gates cannot run");
		});
		return;
	}

	let prevMux: string | undefined;
	let env: TestEnv;
	let gate = "";
	let parentSurface = "";
	let parentSession = "";

	beforeEach(() => {
		prevMux = setBackend("herdr");
		env = createTestEnv("herdr");
		resetProviderRequests();
	});

	afterEach(() => {
		if (gate) {
			const dir = join(EVIDENCE, gate);
			mkdirSync(dir, { recursive: true });
			writeFileSync(
				join(dir, "provider-requests.json"),
				JSON.stringify(getProviderRequests(), null, 2),
			);
			if (existsSync(parentSession))
				writeFileSync(
					join(dir, "parent-session.jsonl"),
					readFileSync(parentSession, "utf8"),
				);
			try {
				writeFileSync(
					join(dir, "parent-screen.txt"),
					readPane(parentSurface, 300),
				);
			} catch {
				// The pane may already be closed.
			}
		}
		// Retained worktree workspaces are separate Herdr workspaces; remove each
		// linked one (branches die with the temp repository), then close the whole
		// fixture group so no workspace or checkout outlives the test.
		let worktrees: Array<{
			open_workspace_id?: string;
			is_linked_worktree?: boolean;
			path: string;
		}> = [];
		try {
			worktrees = JSON.parse(
				execFileSync(
					"herdr",
					["worktree", "list", "--cwd", env.dir, "--json"],
					{
						encoding: "utf8",
						stdio: ["ignore", "pipe", "ignore"],
					},
				),
			).result.worktrees;
		} catch {
			// Not a repository (gates without worktrees).
		}
		for (const worktree of worktrees) {
			if (!worktree.is_linked_worktree || !worktree.open_workspace_id) continue;
			try {
				execFileSync(
					"herdr",
					[
						"worktree",
						"remove",
						"--workspace",
						worktree.open_workspace_id,
						"--force",
						"--json",
					],
					{ stdio: "ignore" },
				);
			} catch {
				// The group close below still reclaims the workspace.
			}
		}
		try {
			execFileSync(
				"herdr",
				["workspace", "close", env.workspaceId, "--group"],
				{
					stdio: "ignore",
				},
			);
		} catch {
			// Already closed.
		}
		for (const worktree of worktrees) {
			if (!worktree.is_linked_worktree) continue;
			rmSync(worktree.path, { recursive: true, force: true });
			try {
				rmdirSync(dirname(worktree.path));
			} catch {
				// Directory shared or not empty.
			}
		}
		cleanupTestEnv(env);
		restoreBackend(prevMux);
	});

	function evidence<T>(name: string, data: T): void {
		const dir = join(EVIDENCE, gate);
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, name),
			isString(data) ? data : JSON.stringify(data, null, 2),
		);
	}

	async function startParent(
		gateName: string,
		id: string,
		extraArgs = "",
	): Promise<void> {
		gate = gateName;
		parentSession = join(env.dir, ".pi", `parent-${id}.jsonl`);
		parentSurface = createTrackedSurface(env, `w4-${gateName}-${id}`);
		await waitForPaneReady(parentSurface);
		startPi(
			parentSurface,
			env.dir,
			`W4_PARENT:${id}:${gateName}\nFollow the scripted scenario.`,
			{
				extraArgs: `--session ${shellQuote(parentSession)} ${extraArgs}`.trim(),
			},
		);
	}

	const parentEntries = () => readEntries(parentSession);
	const deliveredName = (name: string) =>
		resultFor(parentEntries(), name).length > 0;

	// ── G1 ──
	it("G1 fan-out: three bare children, one initial message each, synthesizer after the third delivery", async () => {
		const id = uniqueId();
		const names = ["a", "b", "c"].map((x) => `g1-${id}-${x}`);
		const synth = `g1-${id}-synth`;
		const prompts = names.map(
			(n) =>
				`W4_ROLE_PROMPT<${n}> You review only aspect ${n}. END_ROLE_PROMPT<${n}>`,
		);
		const task = (n: string) => `W4_CHILD:${id}:${n} Report your aspect.`;
		registerScenario((ctx) => {
			if (isParent(ctx, id, "G1")) {
				const launched = ctx.historyToolCalls.filter(
					(n) => n === "subagent",
				).length;
				const delivered = names.filter((n) =>
					ctx.allText.includes(`Sub-agent "${n}" completed`),
				).length;
				if (launched === 0)
					return {
						toolCalls: names.map((n, i) =>
							launch({
								name: n,
								task: task(n),
								systemPrompt: prompts[i],
								fork: false,
							}),
						),
					};
				if (launched === 3 && delivered === 3)
					return {
						toolCalls: [
							launch({
								name: synth,
								task: task(synth),
								systemPrompt: "W4_ROLE_PROMPT<synth> Synthesize.",
								fork: false,
							}),
						],
					};
				return {
					text: `G1_PARENT launched=${launched} delivered=${delivered}`,
				};
			}
			const name = childName(ctx, id);
			if (name) return { text: `G1_CHILD_RESULT_${name}` };
			return null;
		});
		await startParent("G1", id);
		await waitFor(() => deliveredName(synth), "synthesizer delivery");
		await sleep(1500);

		const entries = parentEntries();
		const calls = assistantToolCalls(entries);
		const log: string[] = [];
		// Launched in one turn: the first three calls share one assistant message.
		assert.deepEqual(
			calls.slice(0, 3).map((c) => c.name),
			["subagent", "subagent", "subagent"],
		);
		assert.equal(
			new Set(calls.slice(0, 3).map((c) => c.index)).size,
			1,
			"one turn",
		);
		for (const c of calls.slice(0, 3))
			assert.equal(c.arguments.fork, false, "fork:false passed through");
		// No polling or any other parent tool call.
		assert.deepEqual(
			calls.map((c) => c.name),
			["subagent", "subagent", "subagent", "subagent"],
			"parent made only the four launches",
		);
		// Exactly one terminal result per child, four in total.
		for (const n of [...names, synth])
			assert.equal(resultFor(entries, n).length, 1, `one result for ${n}`);
		assert.equal(results(entries).length, 4);
		// Synthesizer launched after the third delivery (entry order).
		const thirdDelivery = Math.max(
			...names.map((n) => entries.indexOf(resultFor(entries, n)[0])),
		);
		assert.ok(
			calls[3].index > thirdDelivery,
			`synthesizer launch (entry ${calls[3].index}) follows third delivery (entry ${thirdDelivery})`,
		);
		assert.equal(calls[3].arguments.name, synth);
		// One initial message per child with its prompt as the role block.
		names.forEach((n, i) => {
			const reqs = childRequests(id, n);
			assert.equal(reqs.length, 1, `${n}: exactly one provider request`);
			const first = reqs[0];
			assert.equal(
				first.userTexts?.length,
				1,
				`${n}: exactly one user message`,
			);
			const message = first.userTexts![0];
			assert.ok(message.includes(prompts[i]), `${n}: prompt is in the message`);
			assert.ok(
				message.indexOf(prompts[i]) <
					message.indexOf("Complete your task autonomously."),
				`${n}: role block precedes the mode hint`,
			);
			assert.ok(
				message.indexOf("Complete your task autonomously.") <
					message.indexOf(`W4_CHILD:${id}:${n}`),
				`${n}: mode hint precedes the task`,
			);
			prompts.forEach((other, j) => {
				if (j !== i)
					assert.ok(!message.includes(other), `${n}: no other child's prompt`);
			});
			assert.ok(
				!first.system?.includes(prompts[i]),
				`${n}: prompt not in the system prompt (fork:false role-block path)`,
			);
			log.push(
				`${n}: requests=1 userMessages=1 tools=${first.tools?.join(",")}`,
			);
		});
		const synthReq = childRequests(id, synth);
		assert.equal(synthReq.length, 1);
		evidence("g1-summary.txt", log.join("\n"));
	});

	// ── G2 ──
	it("G2 dropout and cancel: one failure, one cancel, exactly one terminal result each, third unaffected", async () => {
		const id = uniqueId();
		const ok = `g2-${id}-ok`;
		const fail = `g2-${id}-fail`;
		const cancel = `g2-${id}-cancel`;
		const startCancel = `/tmp/pi-integ-w4g2-start-${id}.txt`;
		const gateFile = `/tmp/pi-integ-w4g2-gate-${id}.txt`;
		const okDone = `/tmp/pi-integ-w4g2-okdone-${id}.txt`;
		const sleepToken = `93.${Math.floor(Math.random() * 1e6)}`;
		const task = (n: string) => `W4_CHILD:${id}:${n} go`;
		for (const f of [startCancel, gateFile, okDone])
			execFileSync("rm", ["-f", f]);
		registerScenario(async (ctx) => {
			if (isParent(ctx, id, "G2")) {
				const launched = ctx.historyToolCalls.filter(
					(n) => n === "subagent",
				).length;
				if (launched === 0)
					return {
						toolCalls: [
							launch({
								name: ok,
								task: task(ok),
								systemPrompt: `W4_ROLE<${ok}>`,
								fork: false,
							}),
							launch({
								name: fail,
								task: task(fail),
								systemPrompt: `W4_ROLE<${fail}>`,
								fork: false,
								model: "pi-integration/account-rejected",
							}),
							launch({
								name: cancel,
								task: task(cancel),
								systemPrompt: `W4_ROLE<${cancel}>`,
								fork: false,
							}),
						],
					};
				if (
					!ctx.historyToolCalls.includes("subagent_cancel") &&
					ctx.allText.includes(`Sub-agent "${fail}" failed`)
				) {
					// The cancel target must be provably running first.
					await waitForExists(startCancel, 90_000);
					return {
						toolCalls: [
							{ name: "subagent_cancel", arguments: { name: cancel } },
						],
					};
				}
				return { text: "G2_PARENT waiting" };
			}
			const name = childName(ctx, id);
			if (name === ok)
				return ctx.lastRole === "tool"
					? { text: "G2_OK_RESULT" }
					: bash(
							`for i in $(seq 1 400); do [ -f ${gateFile} ] && break; sleep 0.25; done; echo W4_OK_DONE > ${okDone}`,
						);
			if (name === cancel)
				return ctx.lastRole === "tool"
					? { text: "G2_CANCEL_SHOULD_NOT_FINISH" }
					: bash(`echo START > ${startCancel}; sleep ${sleepToken}`);
			return null;
		});
		await startParent("G2", id);

		await waitFor(() => deliveredName(fail), "failed child delivery");
		await waitFor(
			() => deliveredName(cancel),
			"cancelled child delivery",
			120_000,
		);
		// Third child is still running, unaffected by the failure and the cancel.
		assert.equal(deliveredName(ok), false, "third child has no result yet");
		assert.ok(
			pgrepCount(gateFile) >= 1,
			"third child's bash is alive after the cancel",
		);
		const okReqsBefore = childRequests(id, ok).length;
		writeFileSync(gateFile, "go\n");
		await waitFor(() => deliveredName(ok), "third child delivery");
		await sleep(8000);

		const entries = parentEntries();
		for (const n of [ok, fail, cancel])
			assert.equal(
				resultFor(entries, n).length,
				1,
				`exactly one terminal result for ${n}`,
			);
		assert.equal(results(entries).length, 3);
		const failResult = resultFor(entries, fail)[0];
		assert.match(failResult.content, /failed/);
		assert.ok(
			failResult.details.errorMessage || failResult.details.error,
			"failure carries an error",
		);
		const cancelResult = resultFor(entries, cancel)[0];
		assert.equal(cancelResult.details.error, "cancelled");
		assert.equal(cancelResult.details.cancellation.termination, "confirmed");
		const okResult = resultFor(entries, ok)[0];
		assert.match(okResult.content, /completed/);
		assert.match(okResult.content, /G2_OK_RESULT/);
		assert.equal(readFileSync(okDone, "utf8").trim(), "W4_OK_DONE");
		assert.equal(
			okReqsBefore,
			1,
			"third child had made only its first request when cancelled",
		);
		assert.equal(
			childRequests(id, ok).length,
			2,
			"third child: tool call then final answer",
		);
		assert.equal(
			childRequests(id, cancel).length,
			1,
			"cancelled child never made a second request",
		);
		assert.equal(
			pgrepCount(sleepToken),
			0,
			"no leaked sleep from the cancelled child",
		);
		const calls = assistantToolCalls(entries).map((c) => c.name);
		assert.deepEqual(calls, [
			"subagent",
			"subagent",
			"subagent",
			"subagent_cancel",
		]);
		evidence("g2-summary.json", {
			failDetails: failResult.details,
			cancelDetails: cancelResult.details,
			okDetails: { exitCode: okResult.details.exitCode },
		});
		for (const f of [startCancel, gateFile, okDone])
			execFileSync("rm", ["-f", f]);
	});

	// ── G3 ──
	it("G3 candidate worktrees: retained, listed, removal refused while a child is live", async () => {
		const id = uniqueId();
		const baseSha = initRepo(env.dir);
		const a = `g3-${id}-a`;
		const b = `g3-${id}-b`;
		const branchA = `w4/cand-a-${id}`;
		const branchB = `w4/cand-b-${id}`;
		const startedB = `/tmp/pi-integ-w4g3-started-${id}.txt`;
		const gateFile = `/tmp/pi-integ-w4g3-gate-${id}.txt`;
		for (const f of [startedB, gateFile]) execFileSync("rm", ["-f", f]);
		const task = (n: string) => `W4_CHILD:${id}:${n} implement`;
		registerScenario(async (ctx) => {
			if (isParent(ctx, id, "G3")) {
				const hist = ctx.historyToolCalls;
				if (!hist.includes("subagent"))
					return {
						toolCalls: [
							launch({
								name: a,
								task: task(a),
								systemPrompt: `W4_ROLE<${a}>`,
								fork: false,
								worktree: { branch: branchA },
							}),
							launch({
								name: b,
								task: task(b),
								systemPrompt: `W4_ROLE<${b}>`,
								fork: false,
								worktree: { branch: branchB },
							}),
						],
					};
				const aDone = ctx.allText.includes(`Sub-agent "${a}" completed`);
				const bDone = ctx.allText.includes(`Sub-agent "${b}" completed`);
				if (aDone && !bDone && !hist.includes("worktree_remove")) {
					await waitForExists(startedB, 90_000);
					const path = ctx.allText.match(
						new RegExp(
							`Sub-agent "${b}" launched[^\\n]*? in worktree (\\S+) on branch`,
						),
					)?.[1];
					if (!path)
						throw new Error("worktree path of the live child not found");
					return {
						toolCalls: [
							{ name: "worktree_list", arguments: {} },
							{ name: "worktree_remove", arguments: { target: path } },
						],
					};
				}
				if (
					aDone &&
					bDone &&
					hist.filter((n) => n === "worktree_list").length === 1
				)
					return { toolCalls: [{ name: "worktree_list", arguments: {} }] };
				return { text: "G3_PARENT waiting" };
			}
			const name = childName(ctx, id);
			if (name === a)
				return ctx.lastRole === "tool"
					? { text: "G3_A_RESULT" }
					: bash(
							`echo CAND_A > cand-a.txt && git add cand-a.txt && git commit -qm "candidate a"`,
						);
			if (name === b)
				return ctx.lastRole === "tool"
					? { text: "G3_B_RESULT" }
					: bash(
							`echo CAND_B > cand-b.txt && git add cand-b.txt && git commit -qm "candidate b" && echo STARTED > ${startedB} && for i in $(seq 1 400); do [ -f ${gateFile} ] && break; sleep 0.25; done`,
						);
			return null;
		});
		await startParent("G3", id);

		await waitFor(() => deliveredName(a), "candidate A delivery");
		await waitFor(
			() => toolResults(parentEntries(), "worktree_remove").length > 0,
			"worktree_remove result",
		);
		// B is still live; the refusal was issued while it ran.
		assert.equal(deliveredName(b), false, "B still live at the refusal");
		const refusal = toolResults(parentEntries(), "worktree_remove")[0];
		const refusalText = textOf(refusal.message?.content);
		const listResultEarly = textOf(
			toolResults(parentEntries(), "worktree_list")[0]?.message?.content,
		);
		const worktreeB = herdrJson(
			"worktree",
			"list",
			"--cwd",
			env.dir,
			"--json",
		).result.worktrees.find((w: any) => w.branch === branchB);
		assert.ok(worktreeB, "B worktree exists while live");
		assert.equal(
			refusal.message?.isError,
			true,
			`remove refused: ${refusalText}`,
		);
		assert.equal(
			existsSync(worktreeB.path),
			true,
			"refused removal left the checkout",
		);
		writeFileSync(gateFile, "go\n");
		await waitFor(() => deliveredName(b), "candidate B delivery");
		await waitFor(
			() => toolResults(parentEntries(), "worktree_list").length >= 2,
			"second worktree_list",
		);
		await sleep(1500);

		const entries = parentEntries();
		const listAfter = textOf(
			toolResults(entries, "worktree_list")[1].message?.content,
		);
		// SAFETY: herdr's JSON worktree list is the documented CLI contract.
		const worktrees = herdrJson("worktree", "list", "--cwd", env.dir, "--json")
			.result.worktrees as Array<{
			branch: string;
			path: string;
			open_workspace_id?: string;
		}>;
		const wtA = worktrees.find((w) => w.branch === branchA);
		const wtB = worktrees.find((w) => w.branch === branchB);
		assert.ok(wtA && wtB, "both worktrees retained after completion");
		assert.ok(
			wtA.open_workspace_id && wtB.open_workspace_id,
			"workspaces remain open",
		);
		for (const [wt, file, branch] of [
			[wtA, "cand-a.txt", branchA],
			[wtB, "cand-b.txt", branchB],
		] as const) {
			assert.equal(
				existsSync(join(wt.path, file)),
				true,
				`${branch}: file retained`,
			);
			assert.equal(
				git(env.dir, "merge-base", "main", branch),
				baseSha,
				`${branch}: based on committed HEAD`,
			);
			assert.equal(
				git(env.dir, "rev-list", "--count", `main..${branch}`),
				"1",
				`${branch}: one commit ahead`,
			);
			assert.equal(
				git(wt.path, "status", "--porcelain"),
				"",
				`${branch}: clean`,
			);
			assert.match(
				listAfter,
				new RegExp(branch.replace("/", "\\/")),
				`worktree_list shows ${branch}`,
			);
		}
		assert.match(
			listResultEarly,
			new RegExp(branchB.replace("/", "\\/")),
			"worktree_list during the live run shows B",
		);
		for (const n of [a, b]) {
			assert.equal(resultFor(entries, n).length, 1);
			assert.match(
				resultFor(entries, n)[0].content,
				/Worktree result retained for review/,
			);
			assert.match(
				resultFor(entries, n)[0].content,
				new RegExp(`Base/head: ${baseSha}`),
			);
		}
		assert.match(
			refusalText,
			/live|running|active|lease|child/i,
			"refusal names the live child",
		);
		const calls = assistantToolCalls(entries).map((c) => c.name);
		assert.deepEqual(calls, [
			"subagent",
			"subagent",
			"worktree_list",
			"worktree_remove",
			"worktree_list",
		]);
		evidence("g3-summary.json", {
			baseSha,
			refusalText,
			listResultEarly,
			listAfter,
			worktrees,
		});
		for (const f of [startedB, gateFile]) execFileSync("rm", ["-f", f]);
	});

	// ── G4 ──
	it("G4 watcher child: blocking stub gh, delivery wakes the parent, advisories recorded", async () => {
		const id = uniqueId();
		const name = `g4-${id}-watch`;
		const blockSeconds = Number(process.env.W4_G4_BLOCK_SECONDS ?? "85");
		const stubDir = join(env.dir, ".pi", "stub-bin");
		mkdirSync(stubDir, { recursive: true });
		const stub = join(stubDir, "gh");
		const ghLog = join(env.dir, ".pi", "gh-calls.log");
		writeFileSync(
			stub,
			`#!/bin/sh\necho "$(date +%s) gh $*" >> ${ghLog}\nsleep ${blockSeconds}\necho '{"stub":"W4_GH_STUB","pr":1,"checks":[{"name":"ci","state":"SUCCESS"}]}'\n`,
			{ mode: 0o755 },
		);
		// One-minute advisory threshold (the smallest non-zero integer) so a
		// short deterministic block can cross it; the default is 15 minutes.
		const configDir = join(env.dir, ".pi", "agent", "herdr-agents");
		mkdirSync(configDir, { recursive: true });
		writeFileSync(
			join(configDir, "config.json"),
			JSON.stringify({
				...JSON.parse(
					readFileSync(
						join(import.meta.dirname, "../../config.json.example"),
						"utf8",
					),
				),
				supervision: { forcePolling: false, hangWarningMinutes: 1 },
			}),
		);
		registerScenario((ctx) => {
			if (isParent(ctx, id, "G4")) {
				if (!ctx.historyToolCalls.includes("subagent"))
					return {
						toolCalls: [
							launch({
								name,
								task: `W4_CHILD:${id}:${name} Run \`gh pr checks 1 --watch\` once and report.`,
								systemPrompt: `W4_ROLE<${name}> watcher`,
								tools: "read, bash",
								fork: false,
							}),
						],
					};
				return { text: "G4_PARENT woke" };
			}
			if (childName(ctx, id) === name)
				return ctx.lastRole === "tool"
					? { text: "G4_WATCH_REPORT W4_GH_STUB SUCCESS" }
					: // The stub directory is prefixed in the command: panes do not inherit
						// the runner's PATH, and the real gh must never run.
						bash(`PATH=${stubDir}:$PATH gh pr checks 1 --watch`);
			return null;
		});
		await startParent("G4", id);
		await waitFor(
			() => deliveredName(name),
			"watcher delivery",
			(blockSeconds + 90) * 1000,
		);
		await sleep(2000);

		const entries = parentEntries();
		const result = resultFor(entries, name)[0];
		assert.match(result.content, /completed/);
		assert.match(result.content, /W4_GH_STUB/);
		const reqs = childRequests(id, name);
		assert.equal(reqs.length, 2, "tool call then report");
		const childTools = reqs[0].tools ?? [];
		assert.ok(childTools.includes("bash") && childTools.includes("read"));
		assert.equal(childTools.includes("edit"), false);
		assert.equal(
			readFileSync(ghLog, "utf8").trim().split("\n").length,
			1,
			"gh ran exactly once",
		);
		assert.match(readFileSync(ghLog, "utf8"), /gh pr checks 1 --watch/);
		assert.deepEqual(
			assistantToolCalls(entries).map((c) => c.name),
			["subagent"],
		);
		// The delivery wakes the parent: a parent request follows the result.
		const resultIndex = entries.indexOf(result);
		assert.ok(
			entries
				.slice(resultIndex + 1)
				.some((e) => e.type === "message" && e.message?.role === "assistant"),
			"parent produced a turn after the delivery",
		);
		const statuses = custom(entries, "subagent_status").map((e) => ({
			at: e.timestamp,
			content: e.content,
		}));
		evidence("g4-advisories.json", {
			blockSeconds,
			hangWarningMinutes: 1,
			childTools,
			advisoryCount: statuses.length,
			statuses,
			resultTimestamp: result.timestamp,
		});
		console.log(
			`G4 advisories (${statuses.length}): ${JSON.stringify(statuses)}`,
		);
	});

	// ── G5 ──
	it("G5 child MCP visibility with and without tools", async () => {
		const id = uniqueId();
		const open = `g5-${id}-open`;
		const restricted = `g5-${id}-restricted`;
		const server = join(env.dir, ".pi", "stub-mcp.mjs");
		const serverLog = join(env.dir, ".pi", "stub-mcp.log");
		writeFileSync(
			server,
			`import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";
const label = process.argv[2];
const log = process.argv[3];
const note = (event) => appendFileSync(log, JSON.stringify({ t: Date.now(), pid: process.pid, label, ...event }) + "\\n");
const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
note({ started: true });
createInterface({ input: process.stdin }).on("line", (line) => {
	let msg;
	try { msg = JSON.parse(line); } catch { return; }
	note({ method: msg.method });
	if (msg.id === undefined) return;
	if (msg.method === "initialize")
		send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: msg.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: label, version: "1" } } });
	else if (msg.method === "tools/list")
		send({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "w4_echo", description: "W4 stub echo tool", inputSchema: { type: "object", properties: { text: { type: "string" } } } }] } });
	else if (msg.method === "tools/call")
		send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "W4_STUB_ECHO" }] } });
	else if (msg.method === "ping")
		send({ jsonrpc: "2.0", id: msg.id, result: {} });
	else send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "not found" } });
});
`,
		);
		writeFileSync(
			join(env.dir, ".pi", "agent", "mcp.json"),
			JSON.stringify({
				mcpServers: {
					w4direct: {
						command: process.execPath,
						args: [server, "w4direct", serverLog],
						exposure: "direct",
					},
					w4code: {
						command: process.execPath,
						args: [server, "w4code", serverLog],
					},
				},
			}),
		);
		registerScenario((ctx) => {
			if (isParent(ctx, id, "G5")) {
				if (!ctx.historyToolCalls.includes("subagent"))
					return {
						toolCalls: [
							launch({
								name: open,
								task: `W4_CHILD:${id}:${open} report`,
								systemPrompt: `W4_ROLE<${open}>`,
								fork: false,
							}),
							launch({
								name: restricted,
								task: `W4_CHILD:${id}:${restricted} report`,
								systemPrompt: `W4_ROLE<${restricted}>`,
								tools: "read, bash",
								fork: false,
							}),
						],
					};
				return { text: "G5_PARENT" };
			}
			const n = childName(ctx, id);
			if (n === open || n === restricted) return { text: `G5_RESULT_${n}` };
			return null;
		});
		await startParent("G5", id);
		await waitFor(
			() => deliveredName(open) && deliveredName(restricted),
			"both deliveries",
		);
		await sleep(1000);

		const openReq = childRequests(id, open)[0];
		const restrictedReq = childRequests(id, restricted)[0];
		assert.ok(openReq && restrictedReq, "both children reached the provider");
		const mcpOf = (r: ProviderRequest) =>
			(r.tools ?? []).filter((t) => /^mcp__|codemode|tool_search|mcp/i.test(t));
		const serverEvents = existsSync(serverLog)
			? readFileSync(serverLog, "utf8")
					.trim()
					.split("\n")
					.map((l) => JSON.parse(l))
			: [];
		const facts = {
			openTools: openReq.tools,
			restrictedTools: restrictedReq.tools,
			openMcpRelated: mcpOf(openReq),
			restrictedMcpRelated: mcpOf(restrictedReq),
			stubServerEvents: serverEvents,
			openSystemMentionsMcp: /mcp_servers|w4code|w4direct/.test(
				openReq.system ?? "",
			),
			restrictedSystemMentionsMcp: /mcp_servers|w4code|w4direct/.test(
				restrictedReq.system ?? "",
			),
		};
		evidence("g5-facts.json", facts);
		console.log(`G5 facts: ${JSON.stringify(facts)}`);
		assert.ok(
			serverEvents.some((e) => e.method === "tools/list"),
			"stub MCP server was connected and listed by a child",
		);
		// Observed facts on Pi 1.0.3 (see evidence): direct MCP tools and codemode
		// reach a child with no `tools` key, and none reach a `tools: "read, bash"` child.
		assert.ok(
			openReq.tools?.includes("mcp__w4direct__w4_echo"),
			"no-tools child sees the direct MCP tool",
		);
		assert.ok(
			openReq.tools?.includes("codemode"),
			"no-tools child sees codemode",
		);
		assert.deepEqual(
			mcpOf(restrictedReq),
			[],
			"tools-restricted child sees no MCP tool and no codemode",
		);
		assert.deepEqual(restrictedReq.tools, ["bash", "caller_ping", "read"]);
	});

	// ── G6 ──
	it("G6 caller_ping round trip: parent receives the ping, child exits", async () => {
		const id = uniqueId();
		const name = `g6-${id}-ping`;
		const message = `W4_PING_NEEDS_HELP_${id}`;
		registerScenario((ctx) => {
			if (isParent(ctx, id, "G6")) {
				if (!ctx.historyToolCalls.includes("subagent"))
					return {
						toolCalls: [
							launch({
								name,
								task: `W4_CHILD:${id}:${name} ask for help`,
								systemPrompt: `W4_ROLE<${name}>`,
								fork: false,
							}),
						],
					};
				return {
					text:
						"G6_PARENT saw " +
						(ctx.allText.includes(message) ? "ping" : "nothing"),
				};
			}
			if (childName(ctx, id) === name)
				return ctx.historyToolCalls.includes("caller_ping")
					? { text: "G6_CHILD_AFTER_PING" }
					: { toolCalls: [{ name: "caller_ping", arguments: { message } }] };
			return null;
		});
		await startParent("G6", id);
		const ping = await waitFor(
			() => custom(parentEntries(), "subagent_ping")[0],
			"subagent_ping",
		);
		await sleep(8000);
		const entries = parentEntries();
		assert.match(ping.content, new RegExp(message));
		assert.equal(ping.details.name, name);
		assert.equal(custom(entries, "subagent_ping").length, 1, "one ping");
		// SAFETY: subagent_ping details always carry the child's sessionFile.
		const childSession = ping.details.sessionFile as string;
		assert.equal(existsSync(childSession), true, "child session retained");
		assert.deepEqual(
			workspacePanes(env.workspaceId).filter(
				(p) => p !== parentSurface && !p.endsWith(":p1"),
			),
			[],
			"the child pane closed after the ping delivery",
		);
		assert.equal(
			childRequests(id, name).length,
			2,
			"child: the ping call, then one post-ping turn before exiting",
		);
		const parentRequests = getProviderRequests().filter(
			(r) =>
				r.allText?.includes(`W4_PARENT:${id}:G6`) &&
				!r.tools?.includes("caller_ping"),
		);
		assert.ok(
			parentRequests.some((r) => r.allText?.includes(message)),
			"the parent's provider request carried the ping text",
		);
		assert.equal(
			pgrepCount(childSession),
			0,
			"no process still holds the child session",
		);
		evidence("g6-summary.json", {
			ping: ping.content,
			exitSidecarPresent: existsSync(`${childSession}.exit`),
			resultEntriesForChild: resultFor(entries, name).length,
			entryTypes: entries.map(
				(e) => `${e.type}:${e.customType ?? e.message?.role ?? ""}`,
			),
		});
	});

	// ── G6b (supplementary observation, not a gate) ──
	it("G6b caller_ping then more tool work: does the child keep running after the ping?", async () => {
		const id = uniqueId();
		const name = `g6b-${id}-ping`;
		const message = `W4_PING_B_${id}`;
		const after = `/tmp/pi-integ-w4g6b-after-${id}.txt`;
		execFileSync("rm", ["-f", after]);
		registerScenario((ctx) => {
			if (isParent(ctx, id, "G6b")) {
				if (!ctx.historyToolCalls.includes("subagent"))
					return {
						toolCalls: [
							launch({
								name,
								task: `W4_CHILD:${id}:${name} ask for help`,
								systemPrompt: `W4_ROLE<${name}>`,
								fork: false,
							}),
						],
					};
				return { text: "G6b_PARENT" };
			}
			if (childName(ctx, id) === name) {
				if (!ctx.historyToolCalls.includes("caller_ping"))
					return {
						toolCalls: [{ name: "caller_ping", arguments: { message } }],
					};
				if (!ctx.historyToolCalls.includes("bash"))
					return bash(`sleep 2; echo AFTER_PING > ${after}`);
				return { text: "G6B_CHILD_FINAL" };
			}
			return null;
		});
		await startParent("G6b", id);
		const ping = await waitFor(
			() => custom(parentEntries(), "subagent_ping")[0],
			"subagent_ping",
		);
		await sleep(10_000);
		const facts = {
			pingDeliveredAt: ping.timestamp,
			childRequests: childRequests(id, name).length,
			childContinuedToolWorkAfterPing: existsSync(after),
			afterFileMtime: existsSync(after)
				? new Date(statSync(after).mtimeMs).toISOString()
				: null,
			parentCustomTypes: parentEntries()
				.filter((e) => e.type === "custom_message")
				.map((e) => e.customType),
		};
		evidence("g6b-facts.json", facts);
		console.log(`G6b facts: ${JSON.stringify(facts)}`);
		assert.equal(custom(parentEntries(), "subagent_ping").length, 1);
		execFileSync("rm", ["-f", after]);
	});

	// ── G7 ──
	it("G7 nesting: bare child launches a grandchild and ends its turn", async () => {
		const id = uniqueId();
		const child = `g7-${id}-child`;
		const grand = `g7-${id}-grand`;
		const grandStart = `/tmp/pi-integ-w4g7-start-${id}.txt`;
		const grandDone = `/tmp/pi-integ-w4g7-done-${id}.txt`;
		for (const f of [grandStart, grandDone]) execFileSync("rm", ["-f", f]);
		registerScenario((ctx) => {
			if (isParent(ctx, id, "G7")) {
				if (!ctx.historyToolCalls.includes("subagent"))
					return {
						toolCalls: [
							launch({
								name: child,
								task: `W4_CHILD:${id}:${child} delegate`,
								systemPrompt: `W4_ROLE<${child}>`,
								fork: false,
							}),
						],
					};
				return { text: "G7_PARENT woke" };
			}
			const n = childName(ctx, id);
			if (n === child) {
				if (!ctx.historyToolCalls.includes("subagent"))
					return {
						toolCalls: [
							launch({
								name: grand,
								task: `W4_CHILD:${id}:${grand} work`,
								systemPrompt: `W4_ROLE<${grand}>`,
								fork: false,
							}),
						],
					};
				return { text: "G7_CHILD_ENDS_TURN" };
			}
			if (n === grand)
				return ctx.lastRole === "tool"
					? { text: "G7_GRAND_RESULT" }
					: bash(
							`echo START > ${grandStart}; sleep 20; echo DONE > ${grandDone}`,
						);
			return null;
		});
		await startParent("G7", id);
		const childResult = await waitFor(
			() => resultFor(parentEntries(), child)[0],
			"child delivery",
		);
		const childDeliveredAt = Date.now();
		const grandStartedBeforeChildResult = existsSync(grandStart);
		const grandDoneAtChildResult = existsSync(grandDone);
		await waitForExists(grandDone, 60_000);
		const grandDoneAt = statSync(grandDone).mtimeMs;
		await sleep(15_000);

		const entries = parentEntries();
		// SAFETY: subagent_result details always carry the child's sessionFile.
		const childSession = childResult.details.sessionFile as string;
		const childEntries = readEntries(childSession);
		const grandResultsInParent = resultFor(entries, grand);
		const grandResultsInChild = resultFor(childEntries, grand);
		const grandRequests = childRequests(id, grand);
		const facts = {
			childDeliveredBeforeGrandchildFinished:
				!grandDoneAtChildResult && childDeliveredAt < grandDoneAt,
			grandStartedBeforeChildResult: grandStartedBeforeChildResult,
			grandWorkFinished: existsSync(grandDone),
			childResultTimestamp: childResult.timestamp,
			grandDoneFileMtime: new Date(grandDoneAt).toISOString(),
			parentResultNames: results(entries).map((e) => e.details?.name),
			grandResultInParentSession: grandResultsInParent.length,
			grandResultInChildSession: grandResultsInChild.length,
			childSessionCustomTypes: childEntries
				.filter((e) => e.type === "custom_message")
				.map((e) => e.customType),
			parentCustomTypes: entries
				.filter((e) => e.type === "custom_message")
				.map((e) => e.customType),
			childRequestCount: childRequests(id, child).length,
			grandRequestCount: grandRequests.length,
			childExitSidecar: existsSync(`${childSession}.exit`)
				? readFileSync(`${childSession}.exit`, "utf8")
				: null,
			childToolListHadSubagent: childRequests(id, child)[0]?.tools?.includes(
				"subagent",
			),
			workspacePanesAfter: workspacePanes(env.workspaceId),
			parentPane: parentSurface,
			otherPaneTails: Object.fromEntries(
				workspacePanes(env.workspaceId)
					.filter(
						(p) =>
							p !== parentSurface &&
							p !== env.surfaces[0] &&
							!p.endsWith(":p1"),
					)
					.map((p) => [p, readPane(p, 12).trim().split("\n").slice(-6)]),
			),
			parentEntrySummary: entries.map(
				(e) => `${e.type}:${e.customType ?? e.message?.role ?? ""}`,
			),
		};
		evidence("g7-facts.json", facts);
		console.log(`G7 facts: ${JSON.stringify(facts)}`);
		assert.equal(
			childRequests(id, child)[0]?.tools?.includes("subagent"),
			true,
			"bare child could spawn",
		);
		assert.equal(
			resultFor(entries, child).length,
			1,
			"exactly one result for the child",
		);
		assert.equal(
			facts.childDeliveredBeforeGrandchildFinished,
			true,
			"child exited and was delivered before the grandchild finished",
		);
		assert.equal(
			grandResultsInParent.length,
			0,
			"grandchild result never reaches the parent",
		);
		for (const f of [grandStart, grandDone]) execFileSync("rm", ["-f", f]);
	});
});
