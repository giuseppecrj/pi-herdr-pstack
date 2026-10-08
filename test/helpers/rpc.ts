import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PACK_ROOT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
);
/**
 * Skill names in this tree's `skills/` directory. test/skill-content.test.ts
 * checks this set against the inventory, so command tests can follow it.
 */
export const SKILL_NAMES = readdirSync(join(PACK_ROOT, "skills"))
	.filter((name) => existsSync(join(PACK_ROOT, "skills", name, "SKILL.md")))
	.toSorted();
export const FAUX_EXTENSION = join(
	PACK_ROOT,
	"test",
	"fixtures",
	"faux-provider.ts",
);
export const LOCAL_PI_CLI = join(
	PACK_ROOT,
	"node_modules",
	"@earendil-works",
	"pi-coding-agent",
	"dist",
	"bundle",
	"cli.js",
);
export const BUILTIN_EXTENSIONS = [
	"-builtin:mcp",
	"-builtin:llama.cpp",
	"-builtin:codemode",
	"-builtin:tool-search",
];
const INHERITED_ENV =
	/^(HERDR_|PI_SUBAGENT_|PI_DENY_TOOLS|PI_SESSION_|PI_MODEL|PI_PROVIDER|PI_REASONING|PI_CODING_AGENT_DIR)/;

/** A JSON object emitted by Pi on stdout in RPC mode. */
export type RpcRecord = { [key: string]: RpcValue };
export type RpcValue =
	| null
	| boolean
	| number
	| string
	| RpcValue[]
	| RpcRecord;

/** Selects the pinned dev-dependency CLI unless PI_BIN explicitly overrides it. */
export function piCommand(): string[] {
	if (process.env.PI_BIN) return [process.env.PI_BIN];
	return [process.execPath, LOCAL_PI_CLI];
}

export type PackageSource =
	| string
	| { source: string; [filter: string]: unknown };

export type IsolatedPiOptions = {
	packages: PackageSource[];
	herdrAgentsConfig?: string;
	/** Reuse another instance's test-owned root, e.g. to resume its sessions. */
	root?: string;
	/** Persist sessions under the agent directory instead of `--no-session`. */
	persist?: boolean;
	/** Open or create this session file (implies persistence). */
	sessionFile?: string;
	/** Extra Pi settings merged over the isolated defaults. */
	settings?: Record<string, unknown>;
	/** Extra environment, e.g. PI_SUBAGENT_ID. */
	env?: Record<string, string>;
	/** Extra CLI arguments. */
	args?: string[];
};

/**
 * Starts Pi in RPC mode with test-owned agent, home and project directories.
 * Packages load through an isolated settings.json, as an installed package would.
 */
export class IsolatedPi {
	readonly root: string;
	readonly agentDir: string;
	readonly sessionDir: string;
	/** JSON lines written by the faux provider fixture for each model request. */
	readonly requestLog: string;
	readonly records: RpcRecord[] = [];
	stderr = "";
	private readonly child: ChildProcessWithoutNullStreams;
	private nextId = 0;
	private buffer = "";
	private waiters: Array<() => void> = [];
	private readonly ownsRoot: boolean;

	constructor(options: IsolatedPiOptions) {
		this.ownsRoot = options.root === undefined;
		this.root =
			options.root ?? mkdtempSync(join(tmpdir(), "pi-herdr-pstack-test-"));
		this.agentDir = join(this.root, "agent");
		this.sessionDir = join(this.agentDir, "sessions");
		const home = join(this.root, "home");
		const work = join(this.root, "work");
		for (const dir of [this.agentDir, home, work])
			mkdirSync(dir, { recursive: true });
		this.requestLog = join(
			this.root,
			`requests-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`,
		);
		writeFileSync(
			join(this.agentDir, "settings.json"),
			JSON.stringify({
				packages: options.packages,
				extensions: BUILTIN_EXTENSIONS,
				...options.settings,
			}),
		);
		if (options.herdrAgentsConfig !== undefined) {
			mkdirSync(join(this.agentDir, "herdr-agents"));
			writeFileSync(
				join(this.agentDir, "herdr-agents", "config.json"),
				options.herdrAgentsConfig,
			);
		}
		const env: NodeJS.ProcessEnv = {
			...process.env,
			PI_CODING_AGENT_DIR: this.agentDir,
			HOME: home,
			XDG_CONFIG_HOME: join(home, ".config"),
			XDG_DATA_HOME: join(home, ".local", "share"),
			XDG_STATE_HOME: join(home, ".local", "state"),
			XDG_CACHE_HOME: join(home, ".cache"),
			PI_OFFLINE: "1",
			PI_SKIP_VERSION_CHECK: "1",
			PI_TELEMETRY: "0",
			PSTACK_TEST_LOG: this.requestLog,
		};
		for (const key of Object.keys(env))
			if (INHERITED_ENV.test(key) && key !== "PI_CODING_AGENT_DIR")
				delete env[key];
		Object.assign(env, options.env);
		const sessionArgs = options.sessionFile
			? ["--session-dir", this.sessionDir, "--session", options.sessionFile]
			: options.persist
				? ["--session-dir", this.sessionDir]
				: ["--no-session"];
		const [command, ...prefix] = piCommand();
		this.child = spawn(
			command,
			[
				...prefix,
				"--mode",
				"rpc",
				...sessionArgs,
				"--offline",
				"-e",
				FAUX_EXTENSION,
				"-np",
				"-nc",
				"--no-approve",
				"--provider",
				"faux",
				"--model",
				"faux-1",
				...(options.args ?? []),
			],
			{ cwd: work, env, stdio: ["pipe", "pipe", "pipe"] },
		);
		this.child.stderr.setEncoding("utf8");
		this.child.stderr.on("data", (chunk: string) => {
			this.stderr += chunk;
		});
		this.child.stdout.setEncoding("utf8");
		this.child.stdout.on("data", (chunk: string) => this.consume(chunk));
	}

	private consume(chunk: string) {
		this.buffer += chunk;
		let newline = this.buffer.indexOf("\n");
		while (newline >= 0) {
			const line = this.buffer.slice(0, newline).trim();
			this.buffer = this.buffer.slice(newline + 1);
			if (line.startsWith("{")) this.records.push(JSON.parse(line));
			newline = this.buffer.indexOf("\n");
		}
		for (const wake of this.waiters.splice(0)) wake();
	}

	/** Waits for a record at or after `from` that satisfies `matches`. */
	async waitFor(
		matches: (record: RpcRecord) => boolean,
		from = 0,
		timeoutMs = 20_000,
	): Promise<RpcRecord> {
		const deadline = Date.now() + timeoutMs;
		for (;;) {
			const found = this.records.slice(from).find(matches);
			if (found) return found;
			const remaining = deadline - Date.now();
			if (remaining <= 0 || this.child.exitCode !== null)
				throw new Error(
					`timed out waiting for RPC record; stderr:\n${this.stderr.slice(-2000)}`,
				);
			await new Promise<void>((wake) => {
				const timer = setTimeout(wake, Math.min(remaining, 250));
				this.waiters.push(() => {
					clearTimeout(timer);
					wake();
				});
			});
		}
	}

	/** Sends one RPC command and resolves with its response record. */
	async request(command: RpcRecord): Promise<RpcRecord> {
		const id = `test-${this.nextId++}`;
		const from = this.records.length;
		this.child.stdin.write(`${JSON.stringify({ ...command, id })}\n`);
		return this.waitFor(
			(record) => record.type === "response" && record.id === id,
			from,
		);
	}

	/** Sends a command without waiting for its response; an explicit id is kept. */
	send(command: RpcRecord): string {
		const id =
			typeof command.id === "string" ? command.id : `test-${this.nextId++}`;
		this.child.stdin.write(`${JSON.stringify({ ...command, id })}\n`);
		return id;
	}

	/** Model requests the faux provider has seen so far. */
	requests(): RequestLogEntry[] {
		return readRequestLog(this.requestLog);
	}

	/** Prompts and waits until the run it starts (if any) settles. */
	async prompt(message: string): Promise<RpcRecord[]> {
		const from = this.records.length;
		const response = await this.request({ type: "prompt", message });
		if (response.success !== true)
			throw new Error(`prompt failed: ${JSON.stringify(response)}`);
		await this.settled(from);
		return this.records.slice(from);
	}

	/** Waits briefly for a run to start after `from`, then for it to settle. */
	async settled(from: number): Promise<void> {
		const started = await this.waitFor(
			(record) => record.type === "agent_start",
			from,
			750,
		).catch(() => undefined);
		if (started)
			await this.waitFor((record) => record.type === "agent_settled", from);
	}

	/** Notification texts emitted after `from`. */
	notifications(from = 0): string[] {
		return this.records
			.slice(from)
			.filter(
				(record) =>
					record.type === "extension_ui_request" && record.method === "notify",
			)
			.map((record) => String(record.message));
	}

	async close(options: { keepRoot?: boolean } = {}) {
		this.child.stdin.end();
		if (this.child.exitCode === null)
			await new Promise<void>((done) => {
				const timer = setTimeout(() => {
					this.child.kill("SIGKILL");
				}, 5_000);
				this.child.once("exit", () => {
					clearTimeout(timer);
					done();
				});
			});
		if (this.ownsRoot && !options.keepRoot)
			rmSync(this.root, { recursive: true, force: true });
	}

	/** Removes a root kept by `close({ keepRoot: true })`. */
	static removeRoot(root: string) {
		rmSync(root, { recursive: true, force: true });
	}
}

/**
 * One model request as the faux provider fixture saw it. `user` is the last
 * user-role text; Pi sends custom messages as user messages, so it can be an
 * extension message rather than the prompt. `messages` lists every
 * non-system message in order.
 */
export type RequestLogEntry = {
	systemPrompt: string;
	user: string;
	messages: Array<{ role: string; text: string }>;
};

/** Entries the faux provider fixture appended to its PSTACK_TEST_LOG file. */
export function readRequestLog(path: string): RequestLogEntry[] {
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

/** Optional real host package root for combined-host checks. */
export function configuredHostRoot(
	variable = "PI_HERDR_AGENTS_HOST",
): string | undefined {
	const root = process.env[variable];
	if (!root) return undefined;
	if (!existsSync(join(root, "package.json")))
		throw new Error(`${variable} has no package.json: ${root}`);
	return resolve(root);
}
