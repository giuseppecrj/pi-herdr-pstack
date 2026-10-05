import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type FauxResponseStep,
	type JsonObject,
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
} from "@earendil-works/pi-ai";
import {
	type AgentSession,
	createAgentSession,
	DefaultResourceLoader,
	type ExtensionFactory,
	type ExtensionUIContext,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { PACK_ROOT } from "./rpc.ts";

const BUILTIN_EXTENSIONS = [
	"-builtin:mcp",
	"-builtin:llama.cpp",
	"-builtin:codemode",
	"-builtin:tool-search",
];
const AMBIENT_ENV =
	/^(HERDR_|PI_SUBAGENT_|PI_DENY_TOOLS|PI_SESSION_|PI_MODEL|PI_PROVIDER|PI_REASONING|PI_CODING_AGENT_DIR$|HOME$|XDG_)/;

export type UiCall = { method: string; args: unknown[] };

export type SdkOptions = {
	/** Extra package roots, e.g. the real pi-herdr-agents host. */
	packages?: string[];
	/** Package roots or extension files that load before pstack. */
	packagesBefore?: string[];
	/** Extra process environment for this session. */
	env?: Record<string, string>;
	/** Pi settings merged over the isolated defaults. */
	settings?: Record<string, unknown>;
	/** herdr-agents/config.json contents; omit for a missing file. */
	config?: string;
	/** Persist the session under the test-owned agent directory. */
	persist?: boolean;
	/** Sets PI_SUBAGENT_ID for this session. */
	childId?: string;
	/** Inline fixture extensions loaded after the packages. */
	extensions?: ExtensionFactory[];
	/** Dialog behavior; `false` binds no UI (hasUI false). */
	ui?: Partial<ExtensionUIContext> | false;
};

/**
 * A real in-process Pi 1.0.3 session with test-owned agent, home, XDG and
 * project directories. Packages load through settings like installed ones.
 * Environment variables are process-global, so sessions must not overlap.
 */
export class SdkPi {
	readonly root = mkdtempSync(join(tmpdir(), "pi-herdr-pstack-sdk-"));
	readonly agentDir = join(this.root, "agent");
	readonly configPath = join(this.agentDir, "herdr-agents", "config.json");
	readonly work = join(this.root, "work");
	readonly uiCalls: UiCall[] = [];
	readonly errors: string[] = [];
	readonly faux = fauxProvider({
		provider: "faux",
		models: [
			{
				id: "faux-1",
				name: "Faux 1",
				contextWindow: 100_000,
				maxTokens: 4_000,
			},
			{
				id: "faux-2",
				name: "Faux 2",
				contextWindow: 100_000,
				maxTokens: 4_000,
			},
		],
	});
	session!: AgentSession;
	private readonly savedEnv = new Map<string, string | undefined>();

	private constructor() {}

	static async start(options: SdkOptions = {}): Promise<SdkPi> {
		const pi = new SdkPi();
		await pi.init(options);
		return pi;
	}

	private setEnv(key: string, value: string | undefined) {
		if (!this.savedEnv.has(key)) this.savedEnv.set(key, process.env[key]);
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}

	private async init(options: SdkOptions) {
		const home = join(this.root, "home");
		for (const dir of [this.agentDir, home, this.work]) mkdirSync(dir);
		for (const key of Object.keys(process.env))
			if (AMBIENT_ENV.test(key)) this.setEnv(key, undefined);
		this.setEnv("PI_CODING_AGENT_DIR", this.agentDir);
		this.setEnv("HOME", home);
		this.setEnv("XDG_CONFIG_HOME", join(home, ".config"));
		this.setEnv("XDG_DATA_HOME", join(home, ".local", "share"));
		this.setEnv("XDG_STATE_HOME", join(home, ".local", "state"));
		this.setEnv("XDG_CACHE_HOME", join(home, ".cache"));
		this.setEnv("PI_OFFLINE", "1");
		this.setEnv("PI_SKIP_VERSION_CHECK", "1");
		this.setEnv("PI_TELEMETRY", "0");
		this.setEnv("PI_SUBAGENT_ID", options.childId);
		for (const [key, value] of Object.entries(options.env ?? {}))
			this.setEnv(key, value);
		writeFileSync(
			join(this.agentDir, "auth.json"),
			JSON.stringify({ faux: { type: "api_key", key: "test-only-dummy" } }),
		);
		if (options.config !== undefined) this.writeConfig(options.config);

		const settingsManager = SettingsManager.inMemory({
			packages: [
				...(options.packagesBefore ?? []),
				PACK_ROOT,
				...(options.packages ?? []),
			],
			extensions: BUILTIN_EXTENSIONS,
			...options.settings,
		});
		const faux = this.faux;
		const resourceLoader = new DefaultResourceLoader({
			cwd: this.work,
			agentDir: this.agentDir,
			settingsManager,
			noPromptTemplates: true,
			noContextFiles: true,
			extensionFactories: [
				(api) => {
					api.registerProvider(faux.provider);
					// A provider without credentials, for unauthenticated-model checks.
					api.registerProvider("noauth", {
						baseUrl: "http://127.0.0.1:9",
						api: "openai-completions",
						models: [
							{
								id: "model-x",
								name: "No auth",
								reasoning: false,
								input: ["text"],
								cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
								contextWindow: 1000,
								maxTokens: 100,
							},
						],
					});
				},
				...(options.extensions ?? []),
			],
		});
		await resourceLoader.reload();
		const loadErrors = resourceLoader.getExtensions().errors;
		if (loadErrors.length > 0)
			throw new Error(`extension load errors: ${JSON.stringify(loadErrors)}`);
		const { session } = await createAgentSession({
			cwd: this.work,
			agentDir: this.agentDir,
			resourceLoader,
			settingsManager,
			sessionManager: options.persist
				? SessionManager.create(this.work, join(this.agentDir, "sessions"))
				: SessionManager.inMemory(this.work),
		});
		this.session = session;
		const record =
			(method: string, result?: unknown) =>
			(...args: unknown[]) => {
				this.uiCalls.push({ method, args });
				return result;
			};
		const ui =
			options.ui === false
				? undefined
				: ({
						notify: record("notify"),
						setStatus: record("setStatus"),
						setWidget: record("setWidget"),
						setTitle: record("setTitle"),
						setWorkingMessage: record("setWorkingMessage"),
						confirm: async () => false,
						select: async () => undefined,
						input: async () => undefined,
						...options.ui,
					} as unknown as ExtensionUIContext);
		await session.bindExtensions({
			mode: ui ? "rpc" : "print",
			...(ui ? { uiContext: ui } : {}),
			onError: (error) =>
				this.errors.push(`${error.extensionPath}: ${error.error}`),
		});
		await session.setModel(this.faux.getModel());
	}

	writeConfig(text: string) {
		mkdirSync(join(this.agentDir, "herdr-agents"), { recursive: true });
		writeFileSync(this.configPath, text);
	}

	makeConfigUnreadable() {
		chmodSync(this.configPath, 0o000);
	}

	notifications(): string[] {
		return this.uiCalls
			.filter((call) => call.method === "notify")
			.map((call) => String(call.args[0]));
	}

	/** Runs one prompt (or command) and waits for any run it starts to settle. */
	async prompt(text: string): Promise<void> {
		await this.session.prompt(text);
		await this.idle();
	}

	async idle(): Promise<void> {
		// A command's sendUserMessage starts its run asynchronously.
		await new Promise((resolve) => setImmediate(resolve));
		await this.session.waitForIdle();
	}

	/** Scripts the next model turn to call `tool` with `args`, then finish. */
	armToolCall(tool: string, args: JsonObject, after = "done") {
		this.faux.setResponses([
			fauxAssistantMessage([fauxToolCall(tool, args)]),
			fauxAssistantMessage(after),
		]);
	}

	respond(steps: FauxResponseStep[]) {
		this.faux.setResponses(steps);
	}

	/** Tool results recorded in the session, by tool name. */
	toolResults(name: string): Array<{ text: string; isError: boolean }> {
		return this.session.messages.flatMap((message) =>
			message.role === "toolResult" && message.toolName === name
				? [
						{
							text: message.content
								.map((part) => (part.type === "text" ? part.text : ""))
								.join(""),
							isError: message.isError,
						},
					]
				: [],
		);
	}

	dispose() {
		try {
			this.session?.dispose();
		} finally {
			for (const [key, value] of this.savedEnv)
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			try {
				chmodSync(this.configPath, 0o600);
			} catch {
				// Not created or already readable.
			}
			rmSync(this.root, { recursive: true, force: true });
		}
	}
}

export function hostRootOrUndefined(): string | undefined {
	return process.env.PI_HERDR_AGENTS_HOST;
}
