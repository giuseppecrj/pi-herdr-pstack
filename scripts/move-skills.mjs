#!/usr/bin/env node
// Moves skill directories into another folder under skills/ with `git mv`
// and rewrites the relative links between skills so they still resolve.
// Usage: node scripts/move-skills.mjs <destination folder> <skill name>...
// Run from the repository root, for example:
//   node scripts/move-skills.mjs skills/merged tdd teach
//
// Skill markdown writes paths relative to its skill directory, and a path
// that starts with `../` names another skill. Each such path is resolved from
// the file's skill directory before the move and recomputed from its new one.
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join, posix } from "node:path";

const SKILLS = "skills";
/** A `../` path: one or more `../` segments, then path segments. */
const LINK = /(?<![\w./-])(?:\.\.\/)+[\w.-]+(?:\/[\w.-]+)*/g;

const [destination, ...names] = process.argv.slice(2);
if (!destination || names.length === 0) {
	console.error(
		"usage: node scripts/move-skills.mjs <destination folder> <skill name>...",
	);
	process.exit(2);
}
const root = process.cwd();
const dest = posix.normalize(destination).replace(/\/$/, "");
if (dest !== SKILLS && !dest.startsWith(`${SKILLS}/`)) {
	console.error(`${destination}: the destination must be under ${SKILLS}/`);
	process.exit(2);
}

/** Every skill directory under skills/, by name. A skill directory holds SKILL.md and is not searched further. */
function skillDirs(dir = SKILLS, found = new Map()) {
	if (existsSync(join(root, dir, "SKILL.md"))) {
		const name = posix.basename(dir);
		if (found.has(name))
			throw new Error(`${name}: both ${found.get(name)} and ${dir}`);
		found.set(name, dir);
		return found;
	}
	for (const entry of readdirSync(join(root, dir), { withFileTypes: true }))
		if (entry.isDirectory() && !entry.name.startsWith("."))
			skillDirs(posix.join(dir, entry.name), found);
	return found;
}

function markdownFiles(dir) {
	return readdirSync(join(root, dir)).flatMap((entry) => {
		const path = posix.join(dir, entry);
		if (statSync(join(root, path)).isDirectory()) return markdownFiles(path);
		return path.endsWith(".md") ? [path] : [];
	});
}

const before = skillDirs();
const moves = new Map();
for (const name of names) {
	const from = before.get(name);
	if (!from) throw new Error(`${name}: no such skill under ${SKILLS}/`);
	const to = posix.join(dest, name);
	if (from === to) continue;
	if (existsSync(join(root, to))) throw new Error(`${to} already exists`);
	moves.set(from, to);
}
/** The post-move path of a pre-move path. */
const moved = (path) => {
	for (const [from, to] of moves)
		if (path === from || path.startsWith(`${from}/`))
			return to + path.slice(from.length);
	return path;
};

// Read every file and plan its rewrite before anything moves.
const rewrites = [];
for (const oldDir of before.values()) {
	const newDir = moved(oldDir);
	for (const oldPath of markdownFiles(oldDir)) {
		const text = readFileSync(join(root, oldPath), "utf8");
		let count = 0;
		const next = text.replace(LINK, (link) => {
			const trimmed = link.replace(/\.+$/, "");
			const target = posix.normalize(posix.join(oldDir, trimmed));
			if (target === ".." || target.startsWith("../")) return link;
			const relative = posix.relative(newDir, moved(target));
			if (!relative.startsWith("../") || relative === trimmed) return link;
			count += 1;
			return relative + link.slice(trimmed.length);
		});
		if (count > 0) rewrites.push({ path: moved(oldPath), text: next, count });
	}
}

for (const [from, to] of moves) {
	mkdirSync(join(root, posix.dirname(to)), { recursive: true });
	execFileSync("git", ["mv", from, to], { cwd: root });
}
for (const { path, text } of rewrites) writeFileSync(join(root, path), text);

const total = rewrites.reduce((sum, { count }) => sum + count, 0);
console.log(`moved ${moves.size} skill(s) into ${dest}`);
console.log(`rewrote ${total} link(s) in ${rewrites.length} file(s)`);
for (const { path, count } of rewrites) console.log(`  ${path}: ${count}`);
