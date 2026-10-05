import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const ROLE_DISCOVERY_EVENT = "pi-herdr-subagents:roles:discover:v1";
export const AGENTS_DIR = fileURLToPath(
	new URL("../../agents", import.meta.url),
);

type RoleDiscoveryRequest = {
	apiVersion: number;
	register(path: string): void;
};

/** Contributes `agents/` through pi-herdr-agents' public role-pack v1 event. */
export function registerRolePack(pi: ExtensionAPI): void {
	const unsubscribe = pi.events.on(ROLE_DISCOVERY_EVENT, (request) => {
		// SAFETY: the host emits this versioned request shape; apiVersion gates use.
		const discovery = request as RoleDiscoveryRequest;
		if (discovery.apiVersion === 1) discovery.register(AGENTS_DIR);
	});
	pi.on("session_shutdown", unsubscribe);
}
