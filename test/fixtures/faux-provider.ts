import { appendFileSync } from "node:fs";
import {
	type AssistantMessage,
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
	getCurrentSystemPrompt,
	type JsonObject,
	type TranscriptContext,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type ContextMessage = TranscriptContext["messages"][number];

function messageText(message: ContextMessage): string {
	if (message.role === "assistant")
		return message.content
			.map((part) => (part.type === "text" ? part.text : ""))
			.join("");
	if (message.role === "system") return "";
	return typeof message.content === "string"
		? message.content
		: message.content
				.map((part) => (part.type === "text" ? part.text : ""))
				.join("");
}

function lastUserText(context: TranscriptContext): string {
	const last = context.messages.findLast((message) => message.role === "user");
	return last ? messageText(last) : "";
}

/** Pi's compaction and branch summaries call the model with this prompt. */
const SUMMARY_PROMPT = "You are a context summarization assistant.";

/**
 * Test-only deterministic provider. It performs no network access and is not
 * evidence that a live model follows any role or skill prose. With
 * PSTACK_TEST_LOG set, each request's effective system prompt, latest user
 * text and every non-system message's role and text are appended there as
 * JSON lines. Pi converts custom messages to user messages before a request.
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
	let holdMs = 0;
	/** Scripted agent replies; summary requests never consume them. */
	let armed: AssistantMessage[] = [];
	const respond = async (context: TranscriptContext) => {
		const systemPrompt = getCurrentSystemPrompt(context.messages);
		if (log)
			appendFileSync(
				log,
				`${JSON.stringify({
					systemPrompt,
					user: lastUserText(context),
					messages: context.messages
						.filter((message) => message.role !== "system")
						.map((message) => ({
							role: message.role,
							text: messageText(message),
						})),
				})}\n`,
			);
		if (systemPrompt.startsWith(SUMMARY_PROMPT))
			return fauxAssistantMessage("## Goal\nfaux summary");
		if (holdMs > 0) {
			const ms = holdMs;
			holdMs = 0;
			await new Promise((resolve) => setTimeout(resolve, ms));
		}
		return armed.shift() ?? fauxAssistantMessage("ok");
	};
	// Every step is the same dispatcher, enough for any one test process.
	faux.setResponses(Array.from({ length: 1_000 }, () => respond));
	pi.registerProvider(faux.provider);
	pi.registerCommand("test-arm-subagents-list", {
		description: "Test only: the next model turn calls subagents_list",
		handler: async () => {
			armed = [
				fauxAssistantMessage([fauxToolCall("subagents_list", {})]),
				fauxAssistantMessage("done"),
			];
		},
	});
	pi.registerCommand("test-arm-tool", {
		description:
			"Test only: /test-arm-tool <name> <json args>; the next turn calls it",
		handler: async (args) => {
			const space = args.indexOf(" ");
			// SAFETY: test-authored JSON object argument.
			const input = JSON.parse(args.slice(space + 1)) as JsonObject;
			armed = [
				fauxAssistantMessage([fauxToolCall(args.slice(0, space), input)]),
				fauxAssistantMessage("done"),
			];
		},
	});
	pi.registerCommand("test-arm-tools", {
		description:
			"Test only: /test-arm-tools <json [[name, args], ...]>; the next turns call them in order",
		handler: async (args) => {
			// SAFETY: test-authored JSON array of [tool name, arguments] pairs.
			const calls = JSON.parse(args) as Array<[string, JsonObject]>;
			armed = [
				...calls.map(([name, input]) =>
					fauxAssistantMessage([fauxToolCall(name, input)]),
				),
				fauxAssistantMessage("done"),
			];
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
	pi.registerCommand("test-reload", {
		description: "Test only: reload the extension runtime",
		handler: async (_args, ctx) => {
			await ctx.reload();
		},
	});
	pi.registerCommand("test-wake", {
		description:
			"Test only: deliver <text> as a custom message that starts a turn, like a subagent result",
		handler: async (args) => {
			pi.sendMessage(
				{ customType: "test-wake", content: args, display: true },
				{ triggerTurn: true, deliverAs: "steer" },
			);
		},
	});
}
