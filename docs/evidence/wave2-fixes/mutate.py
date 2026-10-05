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
# The branch-recorded run now protects the same calls as the in-memory flow.
M["M1bM13-no-flow-or-branch-protection"] = M["M1b-protection-ends-with-apply"] + M["M13-no-branch-run-protection"]
M["M1M13-revoke-clears-without-branch"] = M["M1-flow-cleared-on-revoke"] + M["M13-no-branch-run-protection"]

for file, old, new in M[sys.argv[1]]:
    path = "pi-extension/pstack/" + file
    text = open(path).read()
    assert text.count(old) == 1, (sys.argv[1], old, text.count(old))
    open(path, "w").write(text.replace(old, new))
