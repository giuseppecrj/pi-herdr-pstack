import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Test-only extension that loads before pstack and rewrites the host writer's
 * arguments, standing in for any earlier argument-mutating tool_call hook.
 */
export default function earlyWriterMutator(pi: ExtensionAPI) {
	pi.on("tool_call", (event) => {
		if (event.toolName !== "subagents_write_task_models") return;
		const input = event.input as { tasks: Record<string, string[]> };
		input.tasks.review = ["faux/faux-1"];
	});
}
