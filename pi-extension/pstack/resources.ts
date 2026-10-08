import { readFileSync, realpathSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const SKILLS_DIR = fileURLToPath(
	new URL("../../skills", import.meta.url),
);

export type OwnedSkillName = "poteto-mode" | "setup-pstack";

export function ownedSkillFile(name: OwnedSkillName): string {
	return fileURLToPath(
		new URL(`../../skills/${name}/SKILL.md`, import.meta.url),
	);
}

/** A loaded skill as Pi reports it, from `getCommands()` or prompt options. */
export type LoadedSkill = { name: string; filePath: string };

export type SkillResolution =
	| { state: "owned"; filePath: string }
	| { state: "missing" }
	| { state: "shadowed"; filePath: string };

function canonical(path: string): string | undefined {
	try {
		return realpathSync(path);
	} catch {
		return undefined;
	}
}

/**
 * Pi keeps the first discovered skill of a name, so the effective skill is the
 * one Pi lists. It counts as working only when it is this package's own file.
 */
export function resolveOwnedSkill(
	skills: readonly LoadedSkill[],
	name: OwnedSkillName,
): SkillResolution {
	const effective = skills.find((skill) => skill.name === name);
	if (!effective) return { state: "missing" };
	const owned = canonical(ownedSkillFile(name));
	return owned !== undefined && canonical(effective.filePath) === owned
		? { state: "owned", filePath: effective.filePath }
		: { state: "shadowed", filePath: effective.filePath };
}

/** Effective skills from the session's command list, which Pi builds from loaded skills. */
export function loadedSkills(pi: ExtensionAPI): LoadedSkill[] {
	return pi
		.getCommands()
		.filter((command) => command.source === "skill")
		.map((command) => ({
			name: command.name.slice("skill:".length),
			filePath: command.sourceInfo.path,
		}));
}

export function describeSkill(
	name: OwnedSkillName,
	resolution: SkillResolution,
): string {
	switch (resolution.state) {
		case "owned":
			return `${name}: loaded from this package (${resolution.filePath})`;
		case "missing":
			return `${name}: not loaded. The package skill was filtered out, disabled or not installed; expected ${ownedSkillFile(name)}`;
		case "shadowed":
			return `${name}: shadowed by ${resolution.filePath}; this package's ${ownedSkillFile(name)} is not the effective skill`;
	}
}

function stripFrontmatter(text: string): string {
	const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text);
	return (match ? text.slice(match[0].length) : text).trim();
}

/** One read of this package's own skill file. */
export type OwnedSkillText = {
	/** The file without frontmatter, trimmed: the text every full load contains. */
	body: string;
	/** The literal full-skill block Pi itself builds for `/skill:<name>`. */
	block: string;
};

/**
 * Reads this package's own file so delivery does not depend on skill command
 * settings or on which same-named skill Pi resolves.
 */
export function readOwnedSkill(name: OwnedSkillName): OwnedSkillText {
	const filePath = ownedSkillFile(name);
	const body = stripFrontmatter(readFileSync(filePath, "utf8"));
	return {
		body,
		block: `<skill name="${name}" location="${filePath}">\nReferences are relative to ${dirname(filePath)}.\n\n${body}\n</skill>`,
	};
}

/** The full-skill block Pi builds for `/skill:<name> <request>`. */
export function skillWrapper(name: OwnedSkillName, request: string): string {
	const { block } = readOwnedSkill(name);
	return request ? `${block}\n\n${request}` : block;
}
