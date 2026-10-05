"""Applies one named fault to the pstack extension source (restored by the caller)."""
import sys

T = "\t"
M = {
    "M1b-protection-ends-with-apply": [(
        "setup.ts",
        "} finally {\n" + T * 4 + "active.applying = false;\n" + T * 3 + "}",
        "} finally {\n" + T * 4 + "active.applying = false;\n" + T * 4 + "if (flow === active) flow = undefined;\n" + T * 3 + "}",
    )],
    "M1-flow-cleared-on-revoke": [(
        "setup.ts",
        T * 2 + "authorization = undefined;\n" + T * 2 + "deactivateApply();\n" + T + "}",
        T * 2 + "authorization = undefined;\n" + T * 2 + "flow = undefined;\n" + T * 2 + "deactivateApply();\n" + T + "}",
    )],
    "M2-apply-parent-ignored": [(
        "setup.ts",
        "let underApply = parent !== undefined && applyCalls.has(parent);",
        "let underApply = false;",
    )],
    "M3-no-branch-lookup": [(
        "setup.ts",
        "underApply = isApplyCall(ctx, parent);",
        "underApply = false;",
    )],
    "M2M3-no-expired-apply-recognition": [
        ("setup.ts", "let underApply = parent !== undefined && applyCalls.has(parent);", "let underApply = false;"),
        ("setup.ts", "underApply = isApplyCall(ctx, parent);", "underApply = false;"),
    ],
    "M5-error-means-no-write": [(
        "setup.ts",
        T + "const after = readConfig();\n" + T + 'if ("revision" in after && after.revision === before.revision)',
        T + "throw new Error(`${reason}. Nothing was written.`);\n" + T + "const after = readConfig();\n" + T + 'if ("revision" in after && after.revision === before.revision)',
    )],
    "M6-key-leak": [(
        "config.ts",
        'return "models has an unsupported key";',
        "return `models has an unsupported key: ${key}`;",
    )],
    "M7-no-signal-check": [(
        "setup.ts",
        'if (approved.signal?.aborted) return "the setup turn was cancelled";',
        "",
    )],
    "M8-no-ref-withholding": [(
        "setup.ts",
        "return /^[\\x21-\\x7e]{1,200}$/.test(ref)",
        "return true",
    )],
    "M9-revoked-not-stale": [(
        "setup.ts",
        "if (ended || flow !== active || active.revoked)",
        "if (ended || flow !== active)",
    )],
    "M10-unchanged-not-checked": [(
        "setup.ts",
        'if ("revision" in after && after.revision === before.revision)',
        "if (false)",
    )],
    "M11-guard-prefix-parent": [(
        "setup.ts",
        "if (parentToolCallId !== approved.parentToolCallId)",
        "if (!parentToolCallId?.startsWith(approved.parentToolCallId))",
    )],
    "M12-no-freeze": [(
        "setup.ts",
        T * 2 + "deepFreeze(event.input);\n" + T * 2 + "Object.freeze(event);\n",
        "",
    )],
    # Reload/reservation fix round (2aa3a17).
    "M13-no-branch-run-protection": [(
        "setup.ts",
        "joined =\n" + T * 5 + "!ctx.isIdle() &&\n" + T * 5 + "unsettledRun(ctx.sessionManager.getBranch()) !== undefined;",
        "joined = false;",
    )],
    "M14-no-settled-entry": [(
        "setup.ts",
        T * 4 + "pi.appendEntry(RUN_ENTRY_TYPE, { runId, state: \"settled\" });",
        T * 4 + "void runId;",
    )],
    "M15-reservation-never-abandoned": [(
        "setup.ts",
        "if (flow && !flow.started) {\n" + T * 3 + "revokeApply();\n" + T * 3 + "flow = undefined;\n" + T * 2 + "}",
        "",
    )],
    "M16-any-prompt-starts-reservation": [(
        "setup.ts",
        "if (markedRun(event.prompt) === flow.runId) flow.started = true;\n" + T * 2 + "else abandonReservation();",
        "flow.started = true;",
    )],
    "M17-no-agent-start-abandon": [(
        "setup.ts",
        T * 2 + "// A run without before_agent_start, such as a triggered custom message.\n" + T * 2 + "abandonReservation();\n",
        "",
    )],
    "M18-idle-not-checked": [(
        "setup.ts",
        "joined =\n" + T * 5 + "!ctx.isIdle() &&\n",
        "joined =\n",
    )],
    "M19-no-idle-session-start-settle": [(
        "setup.ts",
        "if (ctx.isIdle()) settleRecordedRun(ctx);",
        "",
    )],
    "M20-oldest-marker-wins": [(
        "setup.ts",
        "for (const entry of branch.toReversed()) {",
        "for (const entry of branch) {",
    )],
}
# Entry-based identity fix round (76f877f). M13-M20 above target b0207b4's
# marker-based source and no longer apply; N1-N17 target the current source.
M.update({
    # Reviewed P1: a run whose prompt lost its marker is treated as unrelated.
    "N1-unconfirmed-run-unprotected": [(
        "setup.ts",
        T * 3 + "else {\n" + T * 4 + "displacedRuns.add(pending.runId);\n" + T * 4 + "protectUnconfirmed(pending.runId, ctx);\n" + T * 3 + "}",
        T * 3 + "else {\n" + T * 4 + "revokeApply();\n" + T * 4 + "flow = undefined;\n" + T * 3 + "}",
    )],
    # Reviewed P1: identity needs the exact line-anchored marker text.
    "N2-exact-marker-confirmation": [(
        "setup.ts",
        "pending.confirmed = event.prompt.includes(pending.runId);",
        "pending.confirmed = event.prompt.includes(`\\n/setup-pstack opened change flow ${pending.runId}. It ends when this turn settles.\\n`);",
    )],
    # Reviewed P3: tree navigation leaves the run unsettled.
    "N3-no-tree-settle": [(
        "setup.ts",
        T * 2 + "flow = undefined;\n" + T * 2 + "settleRecordedRun(ctx);\n" + T + "});\n" + T + 'pi.on("session_shutdown"',
        T * 2 + "flow = undefined;\n" + T + "});\n" + T + 'pi.on("session_shutdown"',
    )],
    # Reviewed P3: the next new run does not settle a stale started run.
    "N4-no-new-run-settle": [(
        "setup.ts",
        "run = undefined;\n" + T * 2 + "}\n" + T * 2 + 'if (run?.state === "started") record(run.runId, "settled");',
        "run = undefined;\n" + T * 2 + "}",
    )],
    "N5-no-branch-run-protection": [(
        "setup.ts",
        "joined = !ctx.isIdle() && recorded(ctx) !== undefined;",
        "joined = false;",
    )],
    "N6-no-settled-entry": [(
        "setup.ts",
        "const run = recorded(ctx);\n" + T * 3 + 'if (run?.state === "started") record(run.runId, "settled");',
        "const run = recorded(ctx);\n" + T * 3 + "void run;",
    )],
    "N7-opened-run-settled-early": [(
        "setup.ts",
        "const run = recorded(ctx);\n" + T * 3 + 'if (run?.state === "started")',
        "const run = recorded(ctx);\n" + T * 3 + "if (run)",
    )],
    "N8-any-claim-confirmed": [(
        "setup.ts",
        "pending.confirmed = event.prompt.includes(pending.runId);",
        "pending.confirmed = true;",
    )],
    "N9-waiting-reservation-blocks-other-runs": [(
        "setup.ts",
        T * 3 + "if (!flow)\n" + T * 4 + "try {",
        T * 3 + "if (true)\n" + T * 4 + "try {",
    )],
    "N10-idle-not-checked": [(
        "setup.ts",
        "joined = !ctx.isIdle() && recorded(ctx) !== undefined;",
        "joined = recorded(ctx) !== undefined;",
    )],
    "N11-no-idle-session-start-settle": [(
        "setup.ts",
        "if (ctx.isIdle()) settleRecordedRun(ctx);",
        "",
    )],
    "N12-oldest-run-wins": [(
        "setup.ts",
        "for (const entry of branch.toReversed()) {",
        "for (const entry of branch) {",
    )],
    "N13-no-opened-entry": [(
        "setup.ts",
        T * 3 + 'record(runId, "opened");\n',
        "",
    )],
    "N14-no-started-entry": [(
        "setup.ts",
        'if (pending.confirmed) record(pending.runId, "started");\n' + T * 3 + "else {",
        "if (pending.confirmed) void 0;\n" + T * 3 + "else {",
    )],
    "N15-unclaimed-flow-can-apply": [(
        "setup.ts",
        "!active.started ||\n" + T * 4 + "!active.confirmed ||\n" + T * 4,
        "",
    )],
    "N16-no-displaced-protection": [(
        "setup.ts",
        "if (displaced !== undefined) {",
        "if (false) {",
    )],
    "N17-no-unconfirmed-notice": [(
        "setup.ts",
        'if (ctx.hasUI) ctx.ui.notify(UNCONFIRMED_NOTICE, "warning");',
        "",
    )],
})
M["N1N2-reviewed-p1-shape"] = M["N1-unconfirmed-run-unprotected"] + M["N2-exact-marker-confirmation"]
M["N3N4-reviewed-p3-shape"] = M["N3-no-tree-settle"] + M["N4-no-new-run-settle"]
M["M1bN5-no-flow-or-branch-protection"] = M["M1b-protection-ends-with-apply"] + M["N5-no-branch-run-protection"]
M["M1N5-revoke-clears-without-branch"] = M["M1-flow-cleared-on-revoke"] + M["N5-no-branch-run-protection"]

# The branch-recorded run now protects the same calls as the in-memory flow.
M["M1bM13-no-flow-or-branch-protection"] = M["M1b-protection-ends-with-apply"] + M["M13-no-branch-run-protection"]
M["M1M13-revoke-clears-without-branch"] = M["M1-flow-cleared-on-revoke"] + M["M13-no-branch-run-protection"]

for file, old, new in M[sys.argv[1]]:
    path = "pi-extension/pstack/" + file
    text = open(path).read()
    assert text.count(old) == 1, (sys.argv[1], old, text.count(old))
    open(path, "w").write(text.replace(old, new))
