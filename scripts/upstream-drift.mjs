#!/usr/bin/env node
// Reports how far each upstream has moved past its recorded pin (ADR-0003).
// Usage: npm run upstream:drift -- [options]
//   --format markdown|json   output format (default markdown)
//   --upstream <a,b>         only these upstreams (default: cursor, mattpocock, mimir)
//   --source <name>=<path>   checkout of an upstream (default PSTACK_<NAME>_SOURCE)
//   --ref <name>=<ref>       target ref of an upstream (default: its default branch,
//                            origin/HEAD, or HEAD when the checkout has no remote refs)
//   --fetch                  run `git fetch origin` in each checkout first
// Exit codes: 0 no drift, 1 drift, 2 error.
// Read-only: it never writes this repository. The only other process it starts
// is the optional `git fetch` in an upstream checkout, and only with --fetch.
// Each upstream is compared from the commit this pack pins (the
// upstream-scope.json record, or docs/skill-inventory.json for pi-mimir, which
// has no scope record) to the target ref. Every changed path is mapped to what
// the pack recorded for it at the pin; merged skills whose sources changed are
// listed for a manual merge. Pin moves, hashes and the fixtures stay with
// scripts/upstream-scope.mjs and a person.
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { posix } from "node:path";
import {
	FIXTURE,
	GIT_OPTIONS,
	gitIn,
	lines,
	mergedProvenanceFiles,
	mergedSourceFlags,
	provenanceUses,
	readJson,
} from "./upstream-scope-lib.mjs";

const SCHEMA_VERSION = 1;
const USAGE = `usage: npm run upstream:drift -- [--format markdown|json] [--upstream <a,b>] [--source <name>=<path>] [--ref <name>=<ref>] [--fetch]
exit codes: 0 no drift, 1 drift, 2 error`;

class UsageError extends Error {}

function parseArgs(argv) {
	const options = {
		format: "markdown",
		only: undefined,
		sources: {},
		refs: {},
		fetch: false,
	};
	const pair = (flag, value) => {
		const at = value?.indexOf("=") ?? -1;
		if (at < 1 || at === value.length - 1)
			throw new UsageError(`${flag} needs <upstream>=<value>`);
		return [value.slice(0, at), value.slice(at + 1)];
	};
	for (let i = 0; i < argv.length; i++) {
		const flag = argv[i];
		const value = () => {
			const next = argv[++i];
			if (next === undefined) throw new UsageError(`${flag} needs a value`);
			return next;
		};
		if (flag === "--format") options.format = value();
		else if (flag === "--upstream") options.only = value().split(",");
		else if (flag === "--source") {
			const [key, path] = pair(flag, value());
			options.sources[key] = path;
		} else if (flag === "--ref") {
			const [key, ref] = pair(flag, value());
			options.refs[key] = ref;
		} else if (flag === "--fetch") options.fetch = true;
		else throw new UsageError(`unknown argument ${flag}`);
	}
	if (!["markdown", "json"].includes(options.format))
		throw new UsageError("--format must be markdown or json");
	return options;
}

/**
 * Every upstream the pack pins: the scope records, then each remaining
 * inventory source (pi-mimir), whose files ship in skills/pstack.
 */
function upstreamsToCheck(fixture, inventory) {
	const records = fixture.upstreams.map((scope) => ({
		name: scope.upstream,
		folder: scope.folder,
		repository: scope.repository,
		pin: scope.commit,
		root: scope.root,
		skillsRoot: posix.relative(
			scope.root,
			inventory.sources[scope.upstream].root,
		),
		scope,
	}));
	const known = new Set(records.map(({ name }) => name));
	for (const [name, source] of Object.entries(inventory.sources))
		if (!known.has(name))
			records.push({
				name,
				folder: "skills/pstack",
				repository: source.repository,
				pin: source.commit,
				root: source.root,
				skillsRoot: "",
				scope: undefined,
			});
	return records;
}

/** Resolves `ref` (or the default branch) to a commit, naming the ref used. */
function resolveTarget(git, name, ref) {
	const verify = (value) => {
		try {
			return git("rev-parse", "--verify", "--quiet", `${value}^{commit}`)
				.toString()
				.trim();
		} catch {
			return undefined;
		}
	};
	if (ref) {
		const commit = verify(ref);
		if (!commit)
			throw new Error(`${name}: ref ${ref} does not resolve in the checkout`);
		return { ref, commit };
	}
	let head;
	try {
		head = git("symbolic-ref", "--quiet", "refs/remotes/origin/HEAD")
			.toString()
			.trim()
			.replace(/^refs\/remotes\//, "");
	} catch {
		head = undefined;
	}
	for (const candidate of [head, "origin/main", "origin/master"]) {
		const commit = candidate && verify(candidate);
		if (commit) return { ref: candidate, commit };
	}
	// No remote-tracking refs at all (a bare local repository): use its HEAD.
	if (lines(git("for-each-ref", "refs/remotes")).length === 0) {
		const commit = verify("HEAD");
		if (commit) return { ref: "HEAD", commit };
	}
	throw new Error(
		`${name}: cannot find the default branch (no origin/HEAD, origin/main or origin/master); pass --ref ${name}=<ref>`,
	);
}

const isAncestor = (git, ancestor, descendant) => {
	try {
		git("merge-base", "--is-ancestor", ancestor, descendant);
		return true;
	} catch {
		return false;
	}
};

/** `git diff --name-status` between two commits as { path, change } entries. */
function changedPaths(git, from, to, root) {
	const output = git(
		"diff",
		"--no-ext-diff",
		"--no-textconv",
		"--no-renames",
		"--name-status",
		"-z",
		from,
		to,
		"--",
		...(root === "." ? [] : [root]),
	)
		.toString("utf8")
		.split("\0")
		.filter(Boolean);
	const changes = [];
	for (let i = 0; i + 1 < output.length; i += 2)
		changes.push({
			path: posix.relative(root, output[i + 1]),
			change: { A: "added", D: "removed" }[output[i]] ?? "changed",
		});
	return changes.toSorted((a, b) =>
		a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
	);
}

// Path segments, under the skills root, that name one skill: mattpocock/skills
// nests skills one bucket deep (engineering/tdd), the other upstreams do not.
const SKILL_DEPTH = { mattpocock: 2 };
// More new unaccounted files than this in one skill collapse to one Markdown row.
const COLLAPSE_AFTER = 5;

const under = (path, dir) =>
	dir === "" || dir === "." || path === dir || path.startsWith(`${dir}/`);

/** What the pack recorded for an upstream, keyed by path relative to its root. */
function accountingFor({ name, scope, skillsRoot }, inventory) {
	const key = (path) => posix.normalize(posix.join(skillsRoot, path));
	const uses = new Map();
	for (const use of provenanceUses(name))
		uses.set(key(use.path), [...(uses.get(key(use.path)) ?? []), use]);
	const inventoried = new Map();
	for (const skill of inventory.skills)
		for (const path of skill.sourceFiles[name] ?? [])
			inventoried.set(key(path), [
				...(inventoried.get(key(path)) ?? []),
				skill.name,
			]);
	const ignoredTops = new Map([
		...(scope?.outOfScope ?? []).map(({ path }) => [path, "out-of-scope"]),
		...(scope?.unscoped ?? []).map(({ path }) => [path, "unscoped"]),
	]);
	return {
		name,
		scope,
		skillsRoot,
		uses,
		inventoried,
		skillNames: new Set(inventory.skills.map((skill) => skill.name)),
		recordedFiles: new Map((scope?.files ?? []).map((f) => [f.path, f])),
		ignoredTops,
		watched: new Map(
			(scope?.unscoped ?? [])
				.filter(({ watch }) => watch)
				.map(({ path, watch }) => [path, watch.reason]),
		),
		known: new Set([...(scope?.inScope ?? []), ...ignoredTops.keys()]),
	};
}

/** The status the pack recorded for one path: classification, action and notes. */
function statusOf(accounting, path, change) {
	const recorded = accounting.uses.get(path) ?? [];
	const file = accounting.recordedFiles.get(path);
	const fileUses = recorded.filter((use) => use.kind === "file");
	if (fileUses.some((use) => use.status !== "copied"))
		return { classification: "adapted", action: "update", detail: "" };
	if (fileUses.length > 0 || file?.status === "carried")
		return { classification: "shipped", action: "update", detail: "" };
	const planned = recorded.filter((use) => use.kind === "planned");
	if (planned.length > 0)
		return {
			classification: "planned",
			action: "decide",
			detail: planned
				.map((use) => `owned by ${use.owningIssue ?? "a later issue"}`)
				.join("; "),
		};
	if (
		recorded.some((use) => use.kind === "excluded") ||
		file?.status === "excluded"
	)
		return {
			classification: "excluded",
			action: "record",
			detail:
				recorded.find((use) => use.disposition)?.disposition ??
				file?.reason ??
				"",
		};
	if (accounting.inventoried.has(path))
		return {
			classification: "inventory-only",
			action: "update",
			detail: "listed in docs/skill-inventory.json with no per-file hash",
		};
	if (change === "added")
		return {
			classification: "unaccounted",
			action: "decide",
			detail: "new upstream file the pack has not seen",
		};
	return {
		classification: "unaccounted",
		action: change === "removed" ? "record" : "decide",
		detail: "file with no inventory or provenance entry at the pin",
	};
}

/**
 * Paths the scope record decides before any per-file accounting: a watched
 * file, an out-of-scope or unscoped entry (ignored) or an unclassified one.
 */
function scopeStatus(accounting, path, inSkills) {
	const top = path.split("/")[0];
	if (accounting.watched.has(path))
		return {
			status: {
				classification: "watched",
				detail: `watched file changed: ${accounting.watched.get(path)}`,
			},
		};
	if (!accounting.scope || inSkills) return undefined;
	if (accounting.ignoredTops.has(top))
		return {
			ignored: true,
			status: { classification: accounting.ignoredTops.get(top) },
		};
	if (!accounting.known.has(top))
		return {
			status: {
				classification: "unclassified",
				detail:
					"top-level entry the scope record does not classify; classify it in upstream-scope.json",
			},
		};
	return undefined;
}

/** Maps one changed path to a change item, or to an ignored one. */
function classify(accounting, path, change) {
	const { name, skillsRoot } = accounting;
	const top = path.split("/")[0];
	const inSkills = under(path, skillsRoot);
	const skillPath = inSkills ? posix.relative(skillsRoot || ".", path) : "";
	const item = {
		path,
		change,
		area: inSkills ? "skills" : top,
		group: skillPath
			.split("/")
			.slice(0, SKILL_DEPTH[name] ?? 1)
			.join("/"),
		classification: "",
		action: "decide",
		skills: [],
		destinations: [],
		detail: "",
	};
	const special = scopeStatus(accounting, path, inSkills);
	if (special?.ignored)
		return { ignored: true, item: { path, change, ...special.status } };
	if (special) return { item: { ...item, ...special.status } };
	const file = accounting.recordedFiles.get(path);
	const nearSkill = skillPath
		.split("/")
		.filter((segment) => accounting.skillNames.has(segment))
		.slice(0, 1);
	return {
		item: {
			...item,
			...statusOf(accounting, path, change),
			skills: [
				...new Set([...(accounting.inventoried.get(path) ?? []), ...nearSkill]),
			],
			destinations: [
				...new Set([
					...(accounting.uses.get(path) ?? [])
						.filter((use) => use.kind === "file")
						.map((use) => use.destination),
					...(file?.destination ? [file.destination] : []),
				]),
			].toSorted(),
		},
	};
}

function drift(
	entry,
	inventory,
	mergedFiles,
	mergedProvenance,
	options,
	checkout,
) {
	const { name, skillsRoot, root, pin } = entry;
	const git = gitIn(checkout);
	if (options.fetch)
		execFileSync(
			"git",
			["-C", checkout, "fetch", "--quiet", "origin"],
			GIT_OPTIONS,
		);
	try {
		git("cat-file", "-e", `${pin}^{commit}`);
	} catch {
		throw new Error(
			`${name}: the pinned commit ${pin} is not in ${checkout} (use a full clone, and --fetch if it is new)`,
		);
	}
	const target = resolveTarget(git, name, options.refs[name]);
	const warnings = [];
	if (!isAncestor(git, pin, target.commit)) {
		if (isAncestor(git, target.commit, pin))
			throw new Error(
				`${name}: ${target.ref} (${target.commit}) is behind the pin ${pin}; the checkout is stale (use --fetch) or the ref is wrong`,
			);
		warnings.push(
			`the pin ${pin} is not an ancestor of ${target.ref}; upstream history was rewritten or the ref is on another branch, so the diff is a direct tree comparison`,
		);
	}
	const commitsAhead = Number(
		git("rev-list", "--count", `${pin}..${target.commit}`).toString().trim(),
	);

	const accounting = accountingFor(entry, inventory);
	const changes = [];
	const ignored = [];
	for (const { path, change } of changedPaths(git, pin, target.commit, root)) {
		const result = classify(accounting, path, change);
		(result.ignored ? ignored : changes).push(result.item);
	}

	const touched = new Set(
		changes
			.filter(({ change }) => change !== "added")
			.map(({ path }) => posix.relative(skillsRoot || ".", path)),
	);
	const mergedSkills = mergedSourceFlags(mergedFiles, name, touched).map(
		({ file, use, others }) => ({
			file,
			source: name,
			sourcePath: use.path,
			use: use.use,
			otherSources: others,
			provenance: mergedProvenance,
		}),
	);
	return {
		upstream: name,
		folder: entry.folder,
		repository: entry.repository,
		root,
		checkout,
		pin,
		target,
		commitsAhead,
		compare: `${entry.repository.replace(/\.git$/, "")}/compare/${pin}...${target.commit}`,
		warnings,
		drift: changes.length + mergedSkills.length > 0,
		counts: {
			added: changes.filter(({ change }) => change === "added").length,
			changed: changes.filter(({ change }) => change === "changed").length,
			removed: changes.filter(({ change }) => change === "removed").length,
			ignored: ignored.length,
		},
		changes,
		ignored,
		mergedSkills,
	};
}

const code = (text) => `\`${text}\``;

/**
 * Markdown rows for one area: a skill with many new unaccounted files (a whole
 * upstream skill the pack never took) becomes one row; the JSON keeps every file.
 */
function collapse(items) {
	const rows = [];
	const bulk = Map.groupBy(
		items.filter(
			({ change, classification }) =>
				change === "added" && classification === "unaccounted",
		),
		({ group }) => group,
	);
	const seen = new Set();
	for (const item of items) {
		const group = bulk.get(item.group) ?? [];
		const packFiles = item.destinations.length
			? item.destinations
			: item.skills;
		if (
			item.change === "added" &&
			item.classification === "unaccounted" &&
			group.length > COLLAPSE_AFTER
		) {
			if (seen.has(item.group)) continue;
			seen.add(item.group);
			rows.push({
				...item,
				path: `${item.group}/`,
				packFiles,
				detail: `${group.length} new files the pack has not seen (full list in --format json)`,
			});
		} else rows.push({ ...item, packFiles });
	}
	return rows;
}

function markdown(report) {
	const out = [
		"# Upstream drift",
		"",
		report.drift
			? "Drift: yes. Triage every item below (docs/agents/upstream-sync.md)."
			: "Drift: none. Nothing to sync.",
		"",
		"## Pins",
		"",
		"| Upstream | Folder | Pin | Target | Commits ahead | Compare |",
		"| --- | --- | --- | --- | --- | --- |",
		...report.upstreams.map(
			(u) =>
				`| ${u.upstream} | ${code(u.folder)} | ${code(u.pin)} | ${code(u.target.commit)} (${u.target.ref}) | ${u.commitsAhead} | ${u.compare} |`,
		),
	];
	for (const u of report.upstreams) {
		out.push("", `## ${u.upstream} (${code(u.folder)})`, "");
		for (const warning of u.warnings) out.push(`Warning: ${warning}`, "");
		if (!u.drift) {
			out.push(
				u.commitsAhead === 0
					? "Pin is current."
					: `No in-scope change in ${u.commitsAhead} commit${u.commitsAhead === 1 ? "" : "s"}${u.counts.ignored ? `; ${u.counts.ignored} out-of-scope or unscoped path${u.counts.ignored === 1 ? "" : "s"} changed and are ignored` : ""}.`,
			);
			continue;
		}
		out.push(
			`${u.counts.added} added, ${u.counts.changed} changed, ${u.counts.removed} removed in scope; ${u.counts.ignored} out-of-scope or unscoped ignored.`,
		);
		const areas = [...new Set(u.changes.map(({ area }) => area))];
		for (const area of areas) {
			out.push(
				"",
				`### ${code(area)}`,
				"",
				"| Path | Change | Status | Action | Pack files | Note |",
				"| --- | --- | --- | --- | --- | --- |",
			);
			for (const item of collapse(
				u.changes.filter((entry) => entry.area === area),
			))
				out.push(
					`| ${code(item.path)} | ${item.change} | ${item.classification} | ${item.action} | ${item.packFiles.map(code).join(", ")} | ${item.detail.replaceAll("|", "\\|")} |`,
				);
		}
		if (u.mergedSkills.length > 0) {
			out.push("", "### Merged skills needing a manual merge", "");
			for (const m of u.mergedSkills)
				out.push(
					`- ${code(m.file)}: ${m.source} source ${code(m.sourcePath)} (${m.use}) changed or was removed; merge it by hand with the ${m.otherSources.join(" and ")} source${m.otherSources.length === 1 ? "" : "s"}, then record the new hashes in ${code(m.provenance)}.`,
				);
		}
		if (u.ignored.length > 0) {
			out.push("", "### Ignored (out of scope or unscoped)", "");
			for (const item of u.ignored)
				out.push(
					`- ${code(item.path)}: ${item.change}, ${item.classification}`,
				);
		}
	}
	return `${out.join("\n")}\n`;
}

function main() {
	const options = parseArgs(process.argv.slice(2));
	const fixture = readJson(FIXTURE);
	const inventory = readJson("docs/skill-inventory.json");
	const all = upstreamsToCheck(fixture, inventory);
	const names = all.map(({ name }) => name);
	const selected = options.only ?? names;
	for (const name of [
		...selected,
		...Object.keys(options.sources),
		...Object.keys(options.refs),
	])
		if (!names.includes(name))
			throw new UsageError(
				`unknown upstream ${name}; known: ${names.join(", ")}`,
			);
	const mergedFiles = mergedProvenanceFiles(fixture);
	const mergedProvenance = fixture.merged?.provenance ?? "";

	// Check every checkout before running anything, including a fetch.
	const checkouts = new Map();
	for (const name of selected) {
		const checkout =
			options.sources[name] ??
			process.env[`PSTACK_${name.toUpperCase()}_SOURCE`];
		if (!checkout)
			throw new UsageError(
				`${name}: no checkout; pass --source ${name}=<path> or set PSTACK_${name.toUpperCase()}_SOURCE`,
			);
		if (!existsSync(checkout) || !statSync(checkout).isDirectory())
			throw new Error(`${name}: checkout ${checkout} does not exist`);
		checkouts.set(name, checkout);
	}

	const upstreams = all
		.filter(({ name }) => selected.includes(name))
		.map((entry) =>
			drift(
				entry,
				inventory,
				mergedFiles,
				mergedProvenance,
				options,
				checkouts.get(entry.name),
			),
		);
	const report = {
		schemaVersion: SCHEMA_VERSION,
		drift: upstreams.some((u) => u.drift),
		upstreams,
	};
	process.stdout.write(
		options.format === "json"
			? `${JSON.stringify(report, null, 2)}\n`
			: markdown(report),
	);
	process.exitCode = report.drift ? 1 : 0;
}

try {
	main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	if (error instanceof UsageError) console.error(USAGE);
	process.exitCode = 2;
}
