import assert from "node:assert/strict";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// Skills are grouped in folders by upstream (ADR-0003). These checks cover the
// whole skills/ tree, whatever folder a skill is in.
const PACK_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Every file under `dir`, as a posix path relative to `root`. */
function files(root: string, dir: string): string[] {
	return readdirSync(join(root, dir)).flatMap((entry) => {
		const path = posix.join(dir, entry);
		return statSync(join(root, path)).isDirectory()
			? files(root, path)
			: [path];
	});
}

/** Skill directories (holding SKILL.md) under skills/, not searched further, as Pi discovers them. */
function skillDirs(root: string, dir = "skills"): string[] {
	if (existsSync(join(root, dir, "SKILL.md"))) return [dir];
	return readdirSync(join(root, dir), { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
		.flatMap(({ name }) => skillDirs(root, posix.join(dir, name)));
}

/** The skill directory a file belongs to, or undefined outside every skill. */
const skillDirOf = (dirs: string[], path: string) =>
	dirs.find((dir) => path.startsWith(`${dir}/`));

/** `<name>: <dir>, <dir>` for each skill name declared by more than one SKILL.md. */
function duplicateNames(root: string): string[] {
	const byName = new Map<string, string[]>();
	for (const dir of skillDirs(root)) {
		const text = readFileSync(join(root, dir, "SKILL.md"), "utf8");
		const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
		const declared = /^name:\s*["']?([^"'\s]+)["']?\s*$/m.exec(frontmatter);
		// Pi falls back to the directory name when frontmatter declares none.
		const name = declared?.[1] ?? posix.basename(dir);
		byName.set(name, [...(byName.get(name) ?? []), dir]);
	}
	return [...byName]
		.filter(([, dirs]) => dirs.length > 1)
		.map(([name, dirs]) => `${name}: ${dirs.join(", ")}`);
}

/** A `../` path: skill markdown writes these relative to its skill directory. */
const SKILL_RELATIVE = /(?<![\w./-])(?:\.\.\/)+[\w.-]+(?:\/[\w.-]+)*/g;
/** A Markdown link or image target that is not a URL or an in-page anchor. */
const MARKDOWN_LINK = /\]\((?![a-z][a-z0-9+.-]*:|#)([^)\s]+)(?:\s[^)]*)?\)/gi;

/**
 * Whether each line is inside a fenced code block (CommonMark backtick or tilde
 * runs of three or more, closed by a run of the same character at least as long
 * with nothing after it). The fence lines themselves count as inside.
 */
function fencedLines(lines: string[]): boolean[] {
	let open: string | undefined;
	return lines.map((text) => {
		if (open) {
			if (new RegExp(`^\\s*\\${open[0]}{${open.length},}\\s*$`).test(text))
				open = undefined;
			return true;
		}
		open = /^\s*(`{3,}(?=[^`]*$)|~{3,})/.exec(text)?.[1];
		return open !== undefined;
	});
}

/**
 * `<file>:<line>: <link>` for each relative link in skill markdown that does
 * not resolve: every `../` path, resolved from the file's skill directory, and
 * every relative Markdown link in prose, resolved from the file's own
 * directory. A Markdown link inside a fenced block is example text for the
 * user's repo (a GLOSSARY-MAP.md entry, a map body template), not a link from
 * the skill, so only its `../` paths are checked there.
 */
function unresolvedLinks(root: string): string[] {
	const dirs = skillDirs(root);
	const problems: string[] = [];
	for (const path of files(root, "skills").filter((file) =>
		file.endsWith(".md"),
	)) {
		const skillDir = skillDirOf(dirs, path);
		const lines = readFileSync(join(root, path), "utf8").split("\n");
		const fenced = fencedLines(lines);
		lines.forEach((text, index) => {
			const prose = !fenced[index];
			const targets = [
				...[
					...(prose ? text.replace(MARKDOWN_LINK, "]()") : text).matchAll(
						SKILL_RELATIVE,
					),
				].map(([link]) => {
					const trimmed = link.replace(/\.+$/, "");
					return {
						link: trimmed,
						target: skillDir && posix.join(skillDir, trimmed),
					};
				}),
				...[...(prose ? text.matchAll(MARKDOWN_LINK) : [])].map(([, link]) => ({
					link,
					target: posix.join(posix.dirname(path), link.split("#")[0]),
				})),
			];
			for (const { link, target } of targets)
				if (
					!target ||
					target.startsWith("../") ||
					!existsSync(join(root, target))
				)
					problems.push(`${path}:${index + 1}: ${link}`);
		});
	}
	return problems;
}

const scratch = mkdtempSync(join(tmpdir(), "pstack-skill-tree-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** A scratch tree from `{ path: text }`. */
function tree(name: string, entries: Record<string, string>): string {
	const root = join(scratch, name);
	for (const [path, text] of Object.entries(entries)) {
		mkdirSync(join(root, posix.dirname(path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
	return root;
}
const skill = (name: string, body = "") =>
	`---\nname: ${name}\ndescription: ${name} skill\n---\n\n${body}\n`;

describe("skill tree across upstream folders", () => {
	it("finds every shipped skill", () => {
		assert.equal(skillDirs(PACK_ROOT).length, 68);
		for (const dir of skillDirs(PACK_ROOT))
			assert.match(dir, /^skills\/[a-z0-9-]+\/[a-z0-9-]+$/, dir);
	});

	it("has no two skills with the same name in any folders", () => {
		assert.deepEqual(duplicateNames(PACK_ROOT), []);
	});

	it("fails when two folders declare the same skill name", () => {
		const root = tree("duplicate", {
			"skills/pstack/tdd/SKILL.md": skill("tdd"),
			"skills/mattpocock/tdd/SKILL.md": skill("tdd"),
			"skills/mattpocock/other/SKILL.md": skill("teach"),
			"skills/pstack/teach/SKILL.md": skill("teach"),
			"skills/pstack/unique/SKILL.md": skill("unique"),
		});
		assert.deepEqual(duplicateNames(root).toSorted(), [
			"tdd: skills/mattpocock/tdd, skills/pstack/tdd",
			"teach: skills/mattpocock/other, skills/pstack/teach",
		]);
	});

	it("resolves every relative link between and inside skills", () => {
		assert.deepEqual(unresolvedLinks(PACK_ROOT), []);
	});

	it("fails on a link that does not resolve after a skill changes folder", () => {
		const root = tree("links", {
			"skills/pstack/a/SKILL.md": skill(
				"a",
				"Read `../b/SKILL.md`, then `../../merged/c/SKILL.md`.",
			),
			"skills/pstack/a/references/r.md":
				"Prompt in ../poteto-mode/references/delegation.md, verbatim.\n\nSee [b](../../../merged/c/SKILL.md) and [web](https://example.com).\n",
			"skills/merged/c/SKILL.md": skill(
				"c",
				"Back to `../../pstack/a/references/r.md` and [own](references/x.md#top).",
			),
		});
		assert.deepEqual(unresolvedLinks(root), [
			"skills/merged/c/SKILL.md:6: references/x.md#top",
			"skills/pstack/a/SKILL.md:6: ../b/SKILL.md",
			"skills/pstack/a/references/r.md:1: ../poteto-mode/references/delegation.md",
		]);
	});

	it("treats Markdown links in fenced examples as text, but still checks their ../ paths", () => {
		const root = tree("fences", {
			"skills/mattpocock/a/SKILL.md": skill(
				"a",
				[
					"```md",
					"- [Ordering](./src/ordering/GLOSSARY.md): example",
					"- [<title>](link): gist",
					"Read `../gone/SKILL.md` and [b](../../pstack/missing/SKILL.md).",
					"````",
					"```",
					"[still fenced](nowhere.md)",
					"```",
					"After the fence: [prose](nowhere.md).",
				].join("\n"),
			),
		});
		assert.deepEqual(unresolvedLinks(root), [
			"skills/mattpocock/a/SKILL.md:9: ../gone/SKILL.md",
			"skills/mattpocock/a/SKILL.md:9: ../../pstack/missing/SKILL.md",
			"skills/mattpocock/a/SKILL.md:14: nowhere.md",
		]);
	});
});
