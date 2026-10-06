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
	status: "unchanged" | "removed";
	replacements: [];
	removedIn?: string;
	reason?: string;
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
	private?: boolean;
	license: string;
	keywords: string[];
	peerDependencies: Record<string, string>;
	dependencies?: Record<string, string>;
	pi: Record<string, string[]>;
};

describe("Wave 1 moved files", () => {
	it("keeps unchanged files byte for byte and records the poteto role as removed in W2", () => {
		assert.equal(
			provenance.sourceCommit,
			"c2177dff835da44937e614e8a03d0405d442e848",
		);
		assert.equal(existsSync(join(PACK_ROOT, "agents")), false);
		assert.deepEqual(
			provenance.files.map(({ path, status }) => `${status} ${path}`),
			["removed agents/poteto.md", "unchanged LICENSE"],
		);
		for (const entry of provenance.files) {
			assert.equal(entry.sha256, entry.sourceSha256, entry.path);
			if (entry.status === "removed") {
				assert.equal(entry.removedIn, "W2", entry.path);
				assert.match(entry.reason ?? "", /09-wave2-no-poteto-role\.md/);
				assert.equal(existsSync(join(PACK_ROOT, entry.path)), false);
				continue;
			}
			assert.equal(entry.status, "unchanged", entry.path);
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
	it("reproduces each recorded source hash from the source commit", {
		skip:
			!hasSource &&
			"set PI_HERDR_AGENTS_SOURCE to a pi-herdr-agents Git checkout containing the source commit",
	}, () => {
		for (const entry of provenance.files) {
			const blob = execFileSync("git", [
				"-C",
				source,
				"show",
				`${provenance.sourceCommit}:${entry.source}`,
			]);
			assert.equal(sha256(blob), entry.sourceSha256, entry.path);
			if (entry.status === "unchanged")
				assert.equal(blob.toString("utf8"), read(entry.path), entry.path);
		}
	});
});

describe("Wave 2 runtime scope", () => {
	const modules = readdirSync(
		join(PACK_ROOT, "pi-extension", "pstack"),
	).toSorted();
	const source = modules
		.map((name) => read(`pi-extension/pstack/${name}`))
		.join("\n");

	it("ships the mode and setup modules only, with no role registration", () => {
		assert.deepEqual(modules, [
			"config.ts",
			"index.ts",
			"mode.ts",
			"resources.ts",
			"setup.ts",
		]);
		// W2 contributes no named roles and must not register an empty directory.
		assert.doesNotMatch(
			source,
			/roles:discover|registerRolePack|\.\.\/\.\.\/agents|pi\.events\.on/,
		);
	});

	it("imports nothing private from pi-herdr-agents and writes no files itself", () => {
		assert.doesNotMatch(
			source,
			/pi-herdr-agents\/|maestro|pi-extension\/subagents/,
		);
		assert.doesNotMatch(
			source,
			/\b(?:writeFileSync|appendFileSync|renameSync|rmSync|unlinkSync|mkdirSync|copyFileSync|writeFile|appendFile)\b/,
		);
		assert.doesNotMatch(source, /new Proxy|defineProperty|forceSystemPrompt/);
		assert.doesNotMatch(
			source,
			/\.execute\(/,
			"no discovered raw execute callback",
		);
	});
});

describe("package manifest", () => {
	it("is a public released Pi package with host peers", () => {
		assert.equal(manifest.name, "pi-herdr-pstack");
		assert.equal(manifest.private, undefined);
		assert.equal(manifest.version, "0.1.0");
		assert.equal(manifest.license, "MIT");
		assert.ok(manifest.keywords.includes("pi-package"));
		assert.deepEqual(manifest.peerDependencies, {
			"@earendil-works/pi-coding-agent": "^1.0.3",
			"pi-herdr-agents": ">=3.0.0",
			typebox: "^1.3.27",
		});
		assert.equal(manifest.dependencies, undefined);
		assert.deepEqual(manifest.pi, {
			extensions: ["./pi-extension/pstack/index.ts"],
			skills: ["./skills"],
		});
	});

	it("packs the extension, skills and notices without roles, plans or development files", () => {
		const [pack] = JSON.parse(
			execFileSync("npm", ["pack", "--dry-run", "--json"], {
				cwd: PACK_ROOT,
				encoding: "utf8",
			}),
		) as Array<{ files: Array<{ path: string }> }>;
		const skills = execFileSync("git", ["ls-files", "skills"], {
			cwd: PACK_ROOT,
			encoding: "utf8",
		})
			.split("\n")
			.filter(Boolean);
		// The per-owner provenance fixtures record every shipped skill file.
		const recorded = readdirSync(
			join(PACK_ROOT, "test/fixtures/skill-provenance"),
		).flatMap((name) =>
			// SAFETY: test-owned fixtures checked by test/skill-content.test.ts.
			(
				JSON.parse(read(`test/fixtures/skill-provenance/${name}`)) as {
					files: Array<{ path: string }>;
				}
			).files.map(({ path }) => path),
		);
		assert.deepEqual(skills.toSorted(), recorded.toSorted());
		assert.ok(skills.length >= 17);
		assert.deepEqual(
			pack.files.map(({ path }) => path).toSorted(),
			[
				"CHANGELOG.md",
				"LICENSE",
				"README.md",
				"RELEASING.md",
				"THIRD_PARTY_NOTICES.md",
				"docs/compatibility.md",
				"docs/provenance.md",
				"package.json",
				"pi-extension/pstack/config.ts",
				"pi-extension/pstack/index.ts",
				"pi-extension/pstack/mode.ts",
				"pi-extension/pstack/resources.ts",
				"pi-extension/pstack/setup.ts",
				...skills,
			].toSorted(),
		);
	});
});
