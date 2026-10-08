import type {
	ContextEvent,
	ExtensionAPI,
	ExtensionContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
	describeSkill,
	loadedSkills,
	type OwnedSkillText,
	ownedSkillFile,
	readOwnedSkill,
	resolveOwnedSkill,
	type SkillResolution,
} from "./resources.ts";

export const MODE_ENTRY_TYPE = "pi-herdr-pstack:poteto-mode";
export const MODE_SECTION = "pstack_poteto_mode";
/** Hidden custom message carrying the full hub when it is missing from context. */
export const HUB_MESSAGE_TYPE = "pi-herdr-pstack:poteto-hub";
/** Request-only copy of the section for runs Pi starts without a prompt. */
export const REMINDER_MESSAGE_TYPE = "pi-herdr-pstack:poteto-reminder";
const STATUS_KEY = "pi-herdr-pstack";

/** Version 1 of the persisted mode record. Any other shape is invalid. */
export type ModeEntry = { v: 1; active: boolean; owner: string };

export function parseModeEntry(data: unknown): ModeEntry | undefined {
	if (typeof data !== "object" || data === null || Array.isArray(data))
		return undefined;
	const keys = Object.keys(data).toSorted();
	if (keys.join(",") !== "active,owner,v") return undefined;
	const { v, active, owner } = data as Record<string, unknown>;
	if (v !== 1 || typeof active !== "boolean") return undefined;
	if (typeof owner !== "string" || owner.length === 0) return undefined;
	return { v, active, owner };
}

export type ModeState = {
	active: boolean;
	/** Valid records owned by another Pi session, skipped inside a subagent. */
	ignoredInherited: number;
	/** Records with this entry type that failed validation; each resets to off. */
	invalid: number;
};

/**
 * Reduces the active branch, oldest first. Inside a pi-herdr-agents child
 * (`childContext`), records owned by another Pi session are history copied by
 * fork seeding, not the child's own activation, so they are skipped.
 */
export function reduceMode(
	branch: readonly SessionEntry[],
	sessionId: string,
	childContext: boolean,
): ModeState {
	const state: ModeState = { active: false, ignoredInherited: 0, invalid: 0 };
	for (const entry of branch) {
		if (entry.type !== "custom" || entry.customType !== MODE_ENTRY_TYPE)
			continue;
		const record = parseModeEntry(entry.data);
		if (!record) {
			state.invalid++;
			state.active = false;
		} else if (childContext && record.owner !== sessionId) {
			state.ignoredInherited++;
		} else {
			state.active = record.active;
		}
	}
	return state;
}

function isChildContext(): boolean {
	return Boolean(process.env.PI_SUBAGENT_ID);
}

function currentState(ctx: ExtensionContext): ModeState {
	return reduceMode(
		ctx.sessionManager.getBranch(),
		ctx.sessionManager.getSessionId(),
		isChildContext(),
	);
}

export function modeSection(skillFile: string): string {
	return [
		"poteto-mode is on for this session branch until `/poteto-mode off`.",
		`Its methodology is the poteto-mode skill at ${skillFile}. Pi adds the file's full text to the conversation when it is missing; read it yourself only if it is still absent.`,
		"- Match the task to the hub's playbook table, then read only that playbook and the references it needs.",
		"- Start multi-step work with a visible checklist that opens with the playbook's steps, and keep it current.",
		"- Verify against the real artifact before calling anything done, and show the evidence.",
		"- Report every skipped step, unrun check or blocked item with its reason.",
		"- The mode grants no permission: external or irreversible actions still need the user's explicit authorization.",
	].join("\n");
}

type AgentMessage = ContextEvent["messages"][number];

/**
 * Text that can carry a full skill load: user input, extension messages, tool
 * output and `!` output. Assistant text and summaries only paraphrase it.
 */
function carriedText(message: AgentMessage): string[] {
	switch (message.role) {
		case "user":
		case "custom":
		case "toolResult": {
			const { content } = message;
			if (typeof content === "string") return [content];
			return content.flatMap((part) =>
				part.type === "text" ? [part.text] : [],
			);
		}
		case "bashExecution":
			return message.excludeFromContext ? [] : [message.output];
		case "assistant":
		case "system":
		case "compactionSummary":
		case "branchSummary":
			return [];
	}
}

/** Whether the complete current hub body is in these model-visible messages. */
export function hubPresent(
	messages: readonly AgentMessage[],
	body: string,
): boolean {
	return messages.some((message) =>
		carriedText(message).some((text) => text.includes(body)),
	);
}

/**
 * What one agent run applies, fixed when it starts so that toggling the mode
 * mid-run changes only the next prompt.
 */
type RunMode =
	| { kind: "off" }
	/** Started by a prompt; before_agent_start added the section for the whole run. */
	| { kind: "prompt"; skill: OwnedSkillText }
	/** Started without a prompt, e.g. by an extension message with triggerTurn, so Pi skips before_agent_start and runs without the section. */
	| { kind: "wake"; skill: OwnedSkillText; reminder: string };

type Parsed =
	| { kind: "on" }
	| { kind: "off" }
	| { kind: "status" }
	| { kind: "task"; task: string };

export function parseModeCommand(args: string): Parsed {
	const text = args.trim();
	if (text === "" || text === "on") return { kind: "on" };
	if (text === "off") return { kind: "off" };
	if (text === "status") return { kind: "status" };
	return { kind: "task", task: text };
}

export function registerPotetoMode(pi: ExtensionAPI): void {
	let warnedUnavailable = false;
	/** Set when a run starts, cleared when it settles. */
	let run: RunMode | undefined;

	function refresh(ctx: ExtensionContext) {
		ctx.ui.setStatus(
			STATUS_KEY,
			currentState(ctx).active ? "poteto-mode" : undefined,
		);
	}

	function persistence(ctx: ExtensionContext): string {
		return ctx.sessionManager.getSessionFile() === undefined
			? "memory-only: this session has no session file, so the mode lasts only for this process"
			: "persisted in the session file for this branch";
	}

	function setActive(ctx: ExtensionContext, active: boolean): boolean {
		if (currentState(ctx).active === active) return false;
		pi.appendEntry<ModeEntry>(MODE_ENTRY_TYPE, {
			v: 1,
			active,
			owner: ctx.sessionManager.getSessionId(),
		});
		return true;
	}

	function refuseUnavailable(
		ctx: ExtensionContext,
		resolution: SkillResolution,
	) {
		ctx.ui.notify(
			`poteto-mode was not enabled. ${describeSkill("poteto-mode", resolution)}. Enable or unshadow the pi-herdr-pstack skill, then retry.`,
			"warning",
		);
	}

	pi.on("session_start", (_event, ctx) => {
		run = undefined;
		warnedUnavailable = false;
		refresh(ctx);
	});
	pi.on("session_tree", (_event, ctx) => refresh(ctx));
	pi.on("session_compact", (_event, ctx) => refresh(ctx));
	pi.on("session_shutdown", (_event, ctx) => {
		run = undefined;
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});

	function readHub(
		ctx: ExtensionContext,
		failure: string,
	): OwnedSkillText | undefined {
		try {
			return readOwnedSkill("poteto-mode");
		} catch (error) {
			ctx.ui.notify(
				`${failure}: cannot read ${ownedSkillFile("poteto-mode")}: ${error instanceof Error ? error.message : String(error)}`,
				"error",
			);
			return undefined;
		}
	}

	// Authoritative per prompt: recompute from the branch and the model's actual
	// context, never from a cached "loaded" flag.
	pi.on("before_agent_start", (event, ctx) => {
		if (!currentState(ctx).active) {
			warnedUnavailable = false;
			return;
		}
		const resolution = resolveOwnedSkill(
			event.systemPromptOptions.skills,
			"poteto-mode",
		);
		if (resolution.state !== "owned") {
			if (!warnedUnavailable)
				ctx.ui.notify(
					`poteto-mode is on, but no guidance was added. ${describeSkill("poteto-mode", resolution)}.`,
					"warning",
				);
			warnedUnavailable = true;
			return;
		}
		warnedUnavailable = false;
		event.systemPromptOptions.sections[MODE_SECTION] = modeSection(
			resolution.filePath,
		);
		const skill = readHub(ctx, "poteto-mode hub not added");
		if (!skill) return;
		if (
			event.prompt.includes(skill.body) ||
			hubPresent(
				ctx.sessionManager.buildSessionProjection().messages,
				skill.body,
			)
		)
			return;
		return {
			message: {
				customType: HUB_MESSAGE_TYPE,
				content: skill.block,
				display: false,
			},
		};
	});

	pi.on("agent_start", (_event, ctx) => {
		if (run !== undefined) return;
		run = { kind: "off" };
		if (!currentState(ctx).active) return;
		const resolution = resolveOwnedSkill(loadedSkills(pi), "poteto-mode");
		if (resolution.state !== "owned") return;
		const skill = readHub(ctx, "poteto-mode hub not added");
		if (!skill) return;
		// Prompt preparation can fail after before_agent_start without a settled
		// event. Capture only a run that actually starts, not that failed attempt.
		run = ctx.getSystemPrompt().includes(`<${MODE_SECTION}>`)
			? { kind: "prompt", skill }
			: {
					kind: "wake",
					skill,
					reminder: modeSection(resolution.filePath),
				};
	});

	pi.on("agent_settled", () => {
		run = undefined;
	});

	// Per request, so compaction inside a run cannot drop the hub until the next
	// prompt persists a copy. The additions are request-only.
	pi.on("context", (event) => {
		if (run === undefined || run.kind === "off") return;
		const messages = event.messages.slice();
		let changed = false;
		if (!hubPresent(messages, run.skill.body)) {
			const at =
				messages.findLastIndex(
					(message) => message.role === "compactionSummary",
				) + 1;
			messages.splice(at, 0, {
				role: "custom",
				customType: HUB_MESSAGE_TYPE,
				content: run.skill.block,
				display: false,
				timestamp: Date.now(),
			});
			changed = true;
		}
		if (run.kind === "wake") {
			messages.push({
				role: "custom",
				customType: REMINDER_MESSAGE_TYPE,
				content: run.reminder,
				display: false,
				timestamp: Date.now(),
			});
			changed = true;
		}
		return changed ? { messages } : undefined;
	});

	pi.registerCommand("poteto-mode", {
		description:
			"Sticky poteto methodology: /poteto-mode [on|off|status|<task>]",
		getArgumentCompletions: (prefix) =>
			["on", "off", "status"]
				.filter((value) => value.startsWith(prefix.trim()))
				.map((value) => ({ value, label: value })),
		handler: async (args, ctx) => {
			const command = parseModeCommand(args);
			const resolution = resolveOwnedSkill(loadedSkills(pi), "poteto-mode");
			if (command.kind === "status") {
				const state = currentState(ctx);
				const lines = [
					`poteto-mode: ${state.active ? "on" : "off"} (${persistence(ctx)})`,
					`Skill: ${describeSkill("poteto-mode", resolution)}`,
				];
				if (state.active && resolution.state !== "owned")
					lines.push(
						"Guidance is not being added while the skill is unavailable.",
					);
				if (isChildContext())
					lines.push(
						`Subagent session: ${state.ignoredInherited} copied parent record(s) ignored; only this session's own /poteto-mode records apply.`,
					);
				if (state.invalid > 0)
					lines.push(
						`${state.invalid} invalid mode record(s) on this branch were treated as off.`,
					);
				ctx.ui.notify(lines.join("\n"), "info");
				return;
			}
			if (command.kind === "off") {
				const changed = setActive(ctx, false);
				refresh(ctx);
				ctx.ui.notify(
					changed
						? "poteto-mode off. Future prompts get no mode guidance. Earlier context and running subagents are unchanged."
						: "poteto-mode is already off.",
					"info",
				);
				return;
			}
			if (resolution.state !== "owned") {
				refuseUnavailable(ctx, resolution);
				return;
			}
			if (command.kind === "on") {
				const changed = setActive(ctx, true);
				refresh(ctx);
				ctx.ui.notify(
					`${changed ? "poteto-mode on" : "poteto-mode is already on"} (${persistence(ctx)}). It applies from the next prompt.`,
					"info",
				);
				return;
			}
			if (!ctx.isIdle() || ctx.hasPendingMessages()) {
				ctx.ui.notify(
					"poteto-mode task not started: a turn is in progress or messages are queued. Nothing was queued; retry when idle.",
					"warning",
				);
				return;
			}
			const skill = readHub(ctx, "poteto-mode task not started");
			if (!skill) return;
			const loaded = hubPresent(
				ctx.sessionManager.buildSessionProjection().messages,
				skill.body,
			);
			setActive(ctx, true);
			refresh(ctx);
			pi.sendUserMessage(
				loaded ? command.task : `${skill.block}\n\n${command.task}`,
			);
		},
	});
}
