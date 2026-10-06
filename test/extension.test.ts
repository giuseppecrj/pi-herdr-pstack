import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	createAgentSession,
	createEventBus,
	DefaultResourceLoader,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { PACK_ROOT } from "./helpers/rpc.ts";

const EXTENSION = join(PACK_ROOT, "pi-extension", "pstack", "index.ts");
/** pi-herdr-agents' public role-pack discovery event. */
const ROLE_DISCOVERY_EVENT = "pi-herdr-subagents:roles:discover:v1";

function discover(bus: ReturnType<typeof createEventBus>): string[] {
	const registered: string[] = [];
	bus.emit(ROLE_DISCOVERY_EVENT, {
		apiVersion: 1,
		register: (path: string) => registered.push(path),
	});
	return registered;
}

describe("extension in a real SDK session", () => {
	it("registers its two commands and contributes no role directory, across reloads", async () => {
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

			// W2 ships no named roles, so it must not register an empty directory.
			assert.deepEqual(discover(bus), []);
			await session.reload();
			assert.deepEqual(discover(bus), []);
			session.dispose();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
