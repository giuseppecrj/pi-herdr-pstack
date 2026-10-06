import type {
	ExtensionAPI,
	ExtensionContext,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
	describeSkill,
	loadedSkills,
	ownedSkillFile,
	resolveOwnedSkill,
	type SkillResolution,
	skillWrapper,
} from "./resources.ts";

export const MODE_ENTRY_TYPE = "pi-herdr-pstack:poteto-mode";
export const MODE_SECTION = "pstack_poteto_mode";
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
		"poteto-mode is on for this session branch. It stays on until `/poteto-mode off`.",
		`Work by the poteto-mode methodology in ${skillFile}. If its full text is not already in this conversation, read that file in full before starting multi-step work, then follow its playbook routing.`,
		"The mode grants no permission: external or irreversible actions still need the user's explicit authorization.",
	].join("\n");
}

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

	pi.on("session_start", (_event, ctx) => refresh(ctx));
	pi.on("session_tree", (_event, ctx) => refresh(ctx));
	pi.on("session_compact", (_event, ctx) => refresh(ctx));
	pi.on("session_shutdown", (_event, ctx) =>
		ctx.ui.setStatus(STATUS_KEY, undefined),
	);

	// Authoritative per prompt: recompute from the branch, never from a cache.
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
			let prompt: string;
			try {
				prompt = skillWrapper("poteto-mode", command.task);
			} catch (error) {
				ctx.ui.notify(
					`poteto-mode task not started: cannot read ${ownedSkillFile("poteto-mode")}: ${error instanceof Error ? error.message : String(error)}`,
					"error",
				);
				return;
			}
			setActive(ctx, true);
			refresh(ctx);
			pi.sendUserMessage(prompt);
		},
	});
}
