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
}

for file, old, new in M[sys.argv[1]]:
    path = "pi-extension/pstack/" + file
    text = open(path).read()
    assert text.count(old) == 1, (sys.argv[1], old, text.count(old))
    open(path, "w").write(text.replace(old, new))
