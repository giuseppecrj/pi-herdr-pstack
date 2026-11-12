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
 * Markdown links that appear inside fenced template blocks and point into the
 * user's repo or at a placeholder, not at a file of this pack: `<file>: <link>`.
 * Every other link, fenced or not, must resolve.
 */
const ILLUSTRATIVE_LINKS = [
	"skills/mattpocock/domain-modeling/GLOSSARY-FORMAT.md: ./src/ordering/GLOSSARY.md",
	"skills/mattpocock/domain-modeling/GLOSSARY-FORMAT.md: ./src/billing/GLOSSARY.md",
	"skills/mattpocock/domain-modeling/GLOSSARY-FORMAT.md: ./src/fulfillment/GLOSSARY.md",
	"skills/mattpocock/wayfinder/SKILL.md: link",
];

/**
 * `<file>:<line>: <link>` for each relative link in skill markdown that does
 * not resolve: every `../` path, resolved from the file's skill directory, and
 * every relative Markdown link, resolved from the file's own directory, except
 * the `allowed` illustrative template links.
 */
function unresolvedLinks(root: string, allowed: string[] = []): string[] {
	const dirs = skillDirs(root);
	const problems: string[] = [];
	for (const path of files(root, "skills").filter((file) =>
		file.endsWith(".md"),
	)) {
		const skillDir = skillDirOf(dirs, path);
		readFileSync(join(root, path), "utf8")
			.split("\n")
			.forEach((text, index) => {
				const targets = [
					...[
						...text.replace(MARKDOWN_LINK, "]()").matchAll(SKILL_RELATIVE),
					].map(([link]) => {
						const trimmed = link.replace(/\.+$/, "");
						return {
							link: trimmed,
							target: skillDir && posix.join(skillDir, trimmed),
						};
					}),
					...[...text.matchAll(MARKDOWN_LINK)]
						.filter(([, link]) => !allowed.includes(`${path}: ${link}`))
						.map(([, link]) => ({
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

/** Repo files the skills name by bare backticked name; they live in the user's repo. */
const REPO_FILE_NAMES = new Set([
	"0001-slug.md",
	"0002-slug.md",
	"AGENTS.md",
	"CLAUDE.md",
	"CONTEXT-MAP.md",
	"CONTEXT.md",
	"GLOSSARY-MAP.md",
	"GLOSSARY.md",
	"SKILL.md",
	"dark-mode.md",
	"graphql-api.md",
	"map.md",
	"plugin-system.md",
]);

/**
 * `<file>: <name>` for each bare backticked `*.md` name in a mattpocock skill
 * that is neither a file in that skill's folder nor a known repo file. Matt's
 * relative links to supporting files became backticked names, so this keeps
 * them resolving.
 */
function missingSupportingFiles(root: string): string[] {
	const problems: string[] = [];
	for (const dir of skillDirs(root).filter((path) =>
		path.startsWith("skills/mattpocock/"),
	)) {
		const own = new Set(
			files(root, dir).map((path) => posix.relative(dir, path)),
		);
		for (const path of files(root, dir).filter((file) => file.endsWith(".md")))
			for (const [, name] of readFileSync(join(root, path), "utf8").matchAll(
				/`([\w.-]+\.md)`/g,
			))
				if (!own.has(name) && !REPO_FILE_NAMES.has(name))
					problems.push(`${path}: ${name}`);
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
		assert.equal(skillDirs(PACK_ROOT).length, 75);
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
		assert.deepEqual(unresolvedLinks(PACK_ROOT, ILLUSTRATIVE_LINKS), []);
		// Each allowlisted link still occurs and still does not resolve.
		const unlisted = unresolvedLinks(PACK_ROOT);
		for (const entry of ILLUSTRATIVE_LINKS) {
			const [file, link] = entry.split(": ");
			assert.ok(
				unlisted.some(
					(problem) =>
						problem.startsWith(`${file}:`) && problem.endsWith(`: ${link}`),
				),
				`${entry} no longer occurs; drop it from ILLUSTRATIVE_LINKS`,
			);
		}
	});

	it("names only supporting files that exist in the skill's own folder", () => {
		assert.deepEqual(missingSupportingFiles(PACK_ROOT), []);
		const root = tree("supporting", {
			"skills/mattpocock/a/SKILL.md": skill(
				"a",
				"Use `FORMAT.md` and `GONE.md`; edit `AGENTS.md` and `GLOSSARY.md`.",
			),
			"skills/mattpocock/a/FORMAT.md": "format\n",
			"skills/pstack/b/SKILL.md": skill("b", "Ignored here: `ELSEWHERE.md`."),
		});
		assert.deepEqual(missingSupportingFiles(root), [
			"skills/mattpocock/a/SKILL.md: GONE.md",
		]);
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

	it("checks fenced links too, exempting only allowlisted template links", () => {
		const root = tree("fences", {
			"skills/mattpocock/a/SKILL.md": skill(
				"a",
				[
					"```md",
					"- [Ordering](./src/ordering/GLOSSARY.md): example",
					"- [b](../../pstack/missing/SKILL.md) and `../gone/SKILL.md`",
					"```",
				].join("\n"),
			),
		});
		const allowed = [
			"skills/mattpocock/a/SKILL.md: ./src/ordering/GLOSSARY.md",
		];
		assert.deepEqual(unresolvedLinks(root, allowed), [
			"skills/mattpocock/a/SKILL.md:8: ../gone/SKILL.md",
			"skills/mattpocock/a/SKILL.md:8: ../../pstack/missing/SKILL.md",
		]);
		assert.deepEqual(unresolvedLinks(root), [
			"skills/mattpocock/a/SKILL.md:7: ./src/ordering/GLOSSARY.md",
			"skills/mattpocock/a/SKILL.md:8: ../gone/SKILL.md",
			"skills/mattpocock/a/SKILL.md:8: ../../pstack/missing/SKILL.md",
		]);
	});
});
