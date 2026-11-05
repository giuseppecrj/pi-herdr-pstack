import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const PACK_ROOT = fileURLToPath(new URL("..", import.meta.url));
const FIXTURE = join(PACK_ROOT, "test/fixtures/statechart/Break.tla");
const ENTRY = join(PACK_ROOT, "skills/statechart/scripts/statechart.ts");
const CHECK_NO_JAVA = join(
	PACK_ROOT,
	"test/fixtures/statechart/check-no-java.sh",
);

const scratch = mkdtempSync(join(tmpdir(), "pstack-statechart-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

const pathWithoutJava = () => {
	const safe = mkdtempSync(join(scratch, "path-"));
	symlinkSync(process.execPath, join(safe, "node"));
	for (const name of ["sh", "bash", "dirname", "readlink", "sed", "env"]) {
		const resolved = spawnSync("command", ["-v", name], {
			encoding: "utf8",
			shell: true,
		});
		const target = resolved.stdout.trim();
		if (resolved.status === 0 && target) symlinkSync(target, join(safe, name));
	}
	return safe;
};

describe("statechart via tla-ts without Java", () => {
	it("ships a reviewer-rerunnable no-Java check script", () => {
		assert.ok(existsSync(CHECK_NO_JAVA));
		const script = readFileSync(CHECK_NO_JAVA, "utf8");
		assert.match(script, /TLA2TOOLS/);
		assert.match(script, /java/);
		assert.match(script, /statechart/);
	});

	it("checks a tiny breaking fixture and writes a report without Java or TLA2TOOLS", () => {
		assert.ok(existsSync(ENTRY), "statechart.ts missing");
		assert.ok(existsSync(FIXTURE), "Break.tla fixture missing");
		const safePath = pathWithoutJava();
		const out = join(scratch, `chart-${Date.now()}`);
		const env: NodeJS.ProcessEnv = {
			...process.env,
			PATH: safePath,
		};
		delete env.TLA2TOOLS;
		delete env.JAVA;
		const probe = spawnSync("command", ["-v", "java"], {
			encoding: "utf8",
			shell: true,
			env,
		});
		assert.notEqual(
			probe.status,
			0,
			`java must be absent from PATH=${safePath}`,
		);
		const result = spawnSync(
			process.execPath,
			["--disable-warning=ExperimentalWarning", ENTRY, FIXTURE, "--out", out],
			{ encoding: "utf8", env },
		);
		assert.equal(
			result.status,
			1,
			`expected exit 1 (broken invariant); got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
		);
		const report = join(out, "report.md");
		assert.ok(existsSync(report), "report.md missing");
		assert.match(readFileSync(report, "utf8"), /Inv/);
	});
});
