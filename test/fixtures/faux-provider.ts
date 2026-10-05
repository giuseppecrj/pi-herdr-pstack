import { appendFileSync } from "node:fs";
import {
	type FauxResponseStep,
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
	getCurrentSystemPrompt,
	type JsonObject,
	type TranscriptContext,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function lastUserText(context: TranscriptContext): string {
	for (let i = context.messages.length - 1; i >= 0; i--) {
		const message = context.messages[i];
		if (message.role !== "user") continue;
		return typeof message.content === "string"
			? message.content
			: message.content
					.map((part) => (part.type === "text" ? part.text : ""))
					.join("");
	}
	return "";
}

/**
 * Test-only deterministic provider. It performs no network access and is not
 * evidence that a live model follows any role or skill prose. With
 * PSTACK_TEST_LOG set, each request's effective system prompt and latest user
 * text are appended there as JSON lines.
 */
export default function fauxTestProvider(pi: ExtensionAPI) {
	const faux = fauxProvider({
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
	const log = process.env.PSTACK_TEST_LOG;
	// "<request index>:<ms>" delays one response, e.g. to outlast a shutdown.
	const [delayAt, delayMs] = (process.env.PSTACK_TEST_DELAY ?? "-1:0")
		.split(":")
		.map(Number);
	let holdMs = 0;
	let requests = 0;
	const reply =
		(text: string): FauxResponseStep =>
		async (context) => {
			const index = requests++;
			if (index === delayAt) holdMs = delayMs;
			if (log)
				appendFileSync(
					log,
					`${JSON.stringify({
						systemPrompt: getCurrentSystemPrompt(context.messages),
						user: lastUserText(context),
					})}\n`,
				);
			if (holdMs > 0) {
				const ms = holdMs;
				holdMs = 0;
				await new Promise((resolve) => setTimeout(resolve, ms));
			}
			if (log) appendFileSync(log, `${JSON.stringify({ replied: index })}\n`);
			return fauxAssistantMessage(text);
		};
	const replies = () => Array.from({ length: 40 }, () => reply("ok"));
	faux.setResponses(replies());
	pi.registerProvider(faux.provider);
	pi.registerCommand("test-arm-subagents-list", {
		description: "Test only: the next model turn calls subagents_list",
		handler: async () => {
			faux.setResponses([
				fauxAssistantMessage([fauxToolCall("subagents_list", {})]),
				fauxAssistantMessage("done"),
			]);
		},
	});
	pi.registerCommand("test-arm-tool", {
		description:
			"Test only: /test-arm-tool <name> <json args>; the next turn calls it",
		handler: async (args) => {
			const space = args.indexOf(" ");
			// SAFETY: test-authored JSON object argument.
			const input = JSON.parse(args.slice(space + 1)) as JsonObject;
			faux.setResponses([
				fauxAssistantMessage([fauxToolCall(args.slice(0, space), input)]),
				reply("done"),
				...replies(),
			]);
		},
	});
	pi.registerCommand("test-hold", {
		description: "Test only: delay the next model response by <ms>",
		handler: async (args) => {
			holdMs = Number(args);
		},
	});
	pi.registerCommand("test-nav", {
		description: "Test only: navigate the session tree to <entry id>",
		handler: async (args, ctx) => {
			await ctx.navigateTree(args.trim(), { summarize: false });
		},
	});
}
