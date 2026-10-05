import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { PACK_ROOT } from "./helpers/rpc.ts";

type ProvenanceEntry = {
	path: string;
	source: string;
	sourceSha256: string;
	sha256: string;
	status: "unchanged";
	replacements: [];
};

const read = (path: string) => readFileSync(join(PACK_ROOT, path), "utf8");
const sha256 = (value: string | Buffer) =>
	createHash("sha256").update(value).digest("hex");

// SAFETY: test-owned fixture generated from the pinned source commit.
const provenance = JSON.parse(read("test/fixtures/provenance.json")) as {
	sourceCommit: string;
	files: ProvenanceEntry[];
};
// SAFETY: this package's own manifest.
const manifest = JSON.parse(read("package.json")) as {
	name: string;
	version: string;
	private: boolean;
	license: string;
	keywords: string[];
	peerDependencies: Record<string, string>;
	dependencies?: Record<string, string>;
	pi: Record<string, string[]>;
};

function frontmatter(path: string): Map<string, string> {
	const match = /^---\n([\s\S]*?)\n---\n/.exec(read(path));
	assert.ok(match, `${path} must start with frontmatter`);
	const fields = new Map<string, string>();
	for (const line of match[1].split("\n")) {
		const field = /^([a-z][a-z-]*):(?: (.*))?$/.exec(line);
		if (!field) continue;
		assert.equal(fields.has(field[1]), false, `${path}: duplicate ${field[1]}`);
		fields.set(field[1], field[2] ?? "");
	}
	return fields;
}

describe("poteto role", () => {
	it("is the only role and matches the pinned pi-herdr-agents source byte for byte", () => {
		assert.deepEqual(readdirSync(join(PACK_ROOT, "agents")), ["poteto.md"]);
		assert.equal(
			provenance.sourceCommit,
			"c2177dff835da44937e614e8a03d0405d442e848",
		);
		for (const entry of provenance.files) {
			assert.equal(entry.status, "unchanged", entry.path);
			assert.equal(entry.sha256, entry.sourceSha256, entry.path);
			assert.equal(
				sha256(readFileSync(join(PACK_ROOT, entry.path))),
				entry.sha256,
				`${entry.path} changed without updating its reviewed provenance`,
			);
		}
	});

	const source =
		process.env.PI_HERDR_AGENTS_SOURCE ??
		resolve(PACK_ROOT, "..", "pi-herdr-agents");
	const hasSource =
		existsSync(join(source, ".git")) &&
		spawnSync("git", [
			"-C",
			source,
			"cat-file",
			"-e",
			`${provenance.sourceCommit}^{commit}`,
		]).status === 0;
	it("reconstructs from the source commit", {
		skip:
			!hasSource &&
			"set PI_HERDR_AGENTS_SOURCE to a pi-herdr-agents Git checkout containing the source commit",
	}, () => {
		for (const entry of provenance.files)
			assert.equal(
				execFileSync("git", [
					"-C",
					source,
					"show",
					`${provenance.sourceCommit}:${entry.source}`,
				]).toString("utf8"),
				read(entry.path),
				entry.path,
			);
	});

	it("keeps its strict capability declarations and no skill activation yet", () => {
		const fields = frontmatter("agents/poteto.md");
		assert.equal(fields.get("name"), "poteto");
		assert.ok((fields.get("description") ?? "").length > 0);
		assert.equal(fields.get("tools"), "read, bash, edit, write, subagent");
		assert.equal(fields.get("spawning"), "true");
		assert.equal(fields.get("auto-exit"), "true");
		assert.equal(fields.get("system-prompt"), "append");
		assert.equal(fields.get("model"), undefined);
		assert.equal(fields.get("thinking"), undefined);
		// W1 contract: poteto-mode is added only after the real skill ships (W2).
		assert.equal(fields.get("skills"), undefined);
		assert.equal(fields.get("skill"), undefined);
	});

	it("names no other role, so it needs neither pi-herdr-roles nor another pack", () => {
		const body = read("agents/poteto.md");
		assert.doesNotMatch(body, /agent:\s*"/);
		for (const role of [
			"scout",
			"planner",
			"worker",
			"reviewer",
			"adversarial-reviewer",
			"visual-tester",
		])
			assert.doesNotMatch(body, new RegExp(`\`${role}\``));
	});
});

describe("Wave 1 scope", () => {
	it("ships no skills, setup or mode implementation yet", () => {
		assert.equal(existsSync(join(PACK_ROOT, "skills")), false);
		assert.deepEqual(
			readdirSync(join(PACK_ROOT, "pi-extension", "pstack")).toSorted(),
			["index.ts", "roles.ts"],
		);
		const extension = `${read("pi-extension/pstack/index.ts")}\n${read("pi-extension/pstack/roles.ts")}`;
		assert.doesNotMatch(extension, /registerCommand|registerTool|appendEntry/);
		assert.doesNotMatch(
			extension,
			/pi-herdr-agents\/|maestro|pi-extension\/subagents/,
		);
	});
});

describe("package manifest", () => {
	it("is a private experimental Pi package with host peers", () => {
		assert.equal(manifest.name, "pi-herdr-pstack");
		assert.equal(manifest.private, true);
		assert.match(manifest.version, /^0\.\d+\.\d+-experimental\.\d+$/);
		assert.equal(manifest.license, "MIT");
		assert.ok(manifest.keywords.includes("pi-package"));
		assert.deepEqual(manifest.peerDependencies, {
			"@earendil-works/pi-coding-agent": "*",
			"pi-herdr-agents": "*",
		});
		assert.equal(manifest.dependencies, undefined);
		assert.deepEqual(manifest.pi, {
			extensions: ["./pi-extension/pstack/index.ts"],
		});
	});

	it("packs the role, bridge and notices without plans or development files", () => {
		const [pack] = JSON.parse(
			execFileSync("npm", ["pack", "--dry-run", "--json"], {
				cwd: PACK_ROOT,
				encoding: "utf8",
			}),
		) as Array<{ files: Array<{ path: string }> }>;
		assert.deepEqual(pack.files.map(({ path }) => path).toSorted(), [
			"LICENSE",
			"README.md",
			"THIRD_PARTY_NOTICES.md",
			"agents/poteto.md",
			"docs/compatibility.md",
			"docs/provenance.md",
			"package.json",
			"pi-extension/pstack/index.ts",
			"pi-extension/pstack/roles.ts",
		]);
	});
});
