import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const PACK_ROOT = fileURLToPath(new URL("..", import.meta.url));
const LOG_SH = join(PACK_ROOT, "skills/show-me-your-work/scripts/log.sh");
const CHECK_PLAN = join(PACK_ROOT, "skills/poteto-mode/scripts/check-plan.mjs");
const MULTI_PHASE_PLAN = join(
	PACK_ROOT,
	"skills/poteto-mode/playbooks/multi-phase-plan.md",
);

const scratch = mkdtempSync(join(tmpdir(), "pstack-scripts-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

describe("show-me-your-work log.sh", {
	skip: !existsSync(LOG_SH) && "log.sh ships with W4-B",
}, () => {
	/** Runs the script directly, so its shebang and executable bit are exercised. */
	const log = (...args: string[]) =>
		spawnSync(LOG_SH, args, { encoding: "utf8" });
	const rows = (file: string) =>
		readFileSync(file, "utf8")
			.split("\n")
			.filter(Boolean)
			.map((line) => line.split("\t"));

	it("writes the header on first use, creating the directory, and appends after it", () => {
		const file = join(scratch, "first/nested/decisions.tsv");
		assert.equal(
			log(file, "plan", "pick A", "faster", "bench", "ok").status,
			0,
		);
		assert.equal(
			log(file, "build", "keep B", "simpler", "diff", "ok").status,
			0,
		);
		const [header, first, second, ...rest] = rows(file);
		assert.deepEqual(header, [
			"ts",
			"phase",
			"decision",
			"why",
			"evidence",
			"result",
		]);
		assert.equal(rest.length, 0, "one header, two rows");
		assert.match(first[0], /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
		assert.deepEqual(first.slice(1), [
			"plan",
			"pick A",
			"faster",
			"bench",
			"ok",
		]);
		assert.equal(second[1], "build");
	});

	it("strips tabs, newlines and carriage returns so each row stays one line", () => {
		const file = join(scratch, "strip.tsv");
		assert.equal(log(file, "a\tb", "c\nd", "e\rf", "g", "h").status, 0);
		const [, row, ...rest] = rows(file);
		assert.equal(rest.length, 0);
		assert.deepEqual(row.slice(1), ["a b", "c d", "e f", "g", "h"]);
	});

	it("prefixes formula-leading cells with a quote, and only those", () => {
		const file = join(scratch, "formula.tsv");
		assert.equal(log(file, "=1+1", "+x", "-y", "@z", "a=b").status, 0);
		const [, row] = rows(file);
		assert.deepEqual(row.slice(1), ["'=1+1", "'+x", "'-y", "'@z", "a=b"]);
	});

	it("rejects the wrong number of arguments without writing", () => {
		const file = join(scratch, "usage.tsv");
		const result = log(file, "only", "three");
		assert.equal(result.status, 1);
		assert.match(result.stderr, /^usage: log\.sh /);
		assert.equal(existsSync(file), false);
	});
});

describe("poteto-mode check-plan.mjs", {
	skip: !existsSync(CHECK_PLAN) && "check-plan.mjs ships with W4-P",
}, () => {
	/** The plan skeleton: the first ````markdown block of the multi-phase-plan playbook. */
	const skeleton = () => {
		const match = /^````markdown\n([\s\S]*?)\n````$/m.exec(
			readFileSync(MULTI_PHASE_PLAN, "utf8"),
		);
		assert.ok(match, "multi-phase-plan.md has a ````markdown skeleton");
		return `${match[1]}\n`;
	};
	const check = (name: string, text: string) => {
		const file = join(scratch, name);
		writeFileSync(file, text);
		return spawnSync(process.execPath, [CHECK_PLAN, file], {
			encoding: "utf8",
		});
	};

	it("passes the playbook's own skeleton", () => {
		const text = skeleton();
		const result = check("skeleton.md", text);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, / 0 problems\n$/);
		assert.match(
			text,
			/verdict still valid under the patch-id rule in `playbooks\/shipping\.md`/,
		);
		assert.doesNotMatch(text, /patch-id unchanged/);
	});

	it("fails a skeleton with its title removed", () => {
		const result = check("untitled.md", skeleton().replace(/^# .*\n/m, ""));
		assert.equal(result.status, 1);
		assert.match(result.stderr, /no H1 title/);
	});

	it("fails a skeleton whose PR sections lose their checkboxes", () => {
		const result = check(
			"unboxed.md",
			skeleton().replace(/^\s*- \[[ x]\] .*\n/gm, ""),
		);
		assert.equal(result.status, 1);
		assert.notEqual(result.stderr, "");
	});

	it("fails a plan that says patch-id unchanged", () => {
		const result = check(
			"unchanged-patch.md",
			skeleton().replace(
				"with the verdict still valid under the patch-id rule in `playbooks/shipping.md`",
				"patch-id unchanged",
			),
		);
		assert.equal(result.status, 1);
		assert.match(
			result.stderr,
			/"patch-id unchanged"; defer to the patch-id rule in playbooks\/shipping\.md/,
		);
	});

	it("fails a plan that pastes autopilot-full's old unchanged-patch-id sentence", () => {
		const result = check(
			"unchanged-patch-near-miss.md",
			skeleton().replace(
				"<The merge or append rule from the execution playbook, with the patch-id rule from `playbooks/shipping.md`.>",
				"A new head voids the verdict unless the patch-id is unchanged.",
			),
		);
		assert.equal(result.status, 1);
		assert.match(
			result.stderr,
			/"patch-id is unchanged"; defer to the patch-id rule in playbooks\/shipping\.md/,
		);
	});

	it("fails a skeleton that drops a verdict or rebase marker", () => {
		const markers = [
			"Keep that merge base in fix rounds",
			"git merge-tree",
			"code-ready head SHA",
			"each later push that changes the patch",
			"Two or more audit lanes",
			"audits the receipts",
			"filed as a note is a finding",
		];
		for (const marker of markers) {
			const result = check(
				"dropped-marker.md",
				skeleton().replace(marker, "omitted"),
			);
			assert.equal(result.status, 1, marker);
			assert.ok(
				result.stderr.includes(`Program checklist lacks "${marker}"`),
				`${marker}\n${result.stderr}`,
			);
		}
	});
});
