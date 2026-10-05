import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	createAgentSession,
	createEventBus,
	DefaultResourceLoader,
	type ExtensionAPI,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import {
	AGENTS_DIR,
	ROLE_DISCOVERY_EVENT,
	registerRolePack,
} from "../pi-extension/pstack/roles.ts";
import { PACK_ROOT } from "./helpers/rpc.ts";

const EXTENSION = join(PACK_ROOT, "pi-extension", "pstack", "index.ts");

function discover(
	bus: ReturnType<typeof createEventBus>,
	apiVersion: number,
): string[] {
	const registered: string[] = [];
	bus.emit(ROLE_DISCOVERY_EVENT, {
		apiVersion,
		register: (path: string) => registered.push(path),
	});
	return registered;
}

describe("role-pack v1 bridge", () => {
	it("contributes the package agents directory", () => {
		assert.equal(AGENTS_DIR, join(PACK_ROOT, "agents"));
	});

	it("removes its own listener from its session_shutdown handler", () => {
		// Pi 1.0.3 also drops extension listeners on reload/dispose, so this checks
		// the pack's own ADR-0003 cleanup directly against a real SDK event bus.
		const bus = createEventBus();
		const shutdown: Array<() => void> = [];
		const registered: string[] = [];
		const api = {
			events: bus,
			on(event: string, handler: () => void) {
				registered.push(event);
				if (event === "session_shutdown") shutdown.push(handler);
			},
		};
		// SAFETY: the bridge only uses events and on at load time.
		registerRolePack(api as unknown as ExtensionAPI);
		assert.deepEqual(registered, ["session_shutdown"]);
		assert.deepEqual(discover(bus, 1), [AGENTS_DIR]);
		assert.deepEqual(discover(bus, 2), [], "only apiVersion 1 is accepted");
		shutdown[0]();
		assert.deepEqual(discover(bus, 1), []);
	});
});

describe("role-pack v1 bridge in a real SDK session", () => {
	it("registers once across reloads, not after dispose, beside its two commands", async () => {
		const root = mkdtempSync(join(tmpdir(), "pi-herdr-pstack-sdk-"));
		const cwd = join(root, "work");
		const agentDir = join(root, "agent");
		mkdirSync(cwd);
		mkdirSync(agentDir);
		try {
			const bus = createEventBus();
			const settingsManager = SettingsManager.inMemory({});
			const resourceLoader = new DefaultResourceLoader({
				cwd,
				agentDir,
				eventBus: bus,
				settingsManager,
				noExtensions: true,
				noSkills: true,
				noPromptTemplates: true,
				noContextFiles: true,
				additionalExtensionPaths: [EXTENSION],
			});
			await resourceLoader.reload();
			const extensions = resourceLoader.getExtensions();
			assert.deepEqual(extensions.errors, []);
			assert.equal(extensions.extensions.length, 1);
			assert.deepEqual(
				[...extensions.extensions[0].commands.keys()].toSorted(),
				["poteto-mode", "setup-pstack"],
			);
			const { session } = await createAgentSession({
				cwd,
				agentDir,
				resourceLoader,
				settingsManager,
				sessionManager: SessionManager.inMemory(cwd),
			});
			await session.bindExtensions({});

			assert.deepEqual(discover(bus, 1), [AGENTS_DIR]);
			await session.reload();
			await session.reload();
			assert.deepEqual(discover(bus, 1), [AGENTS_DIR]);
			session.dispose();
			assert.deepEqual(discover(bus, 1), []);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
