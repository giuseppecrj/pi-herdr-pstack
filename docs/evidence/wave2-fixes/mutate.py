"""Applies one named fault to the pstack extension source (restored by the caller).

Rebuilt for the unconditional writer gate (docs/plans/10). The run-identity
faults of earlier rounds (M1-M3, M7, M9, M11-M20, N1-N17) target code that no
longer exists; see README.md for each removed shape and why.
"""
import sys

T = "\t"
M = {
    # The gate: blocked by default, sole exception is the live approval.
    "G1-default-allow": [(
        "setup.ts",
        T * 2 + "const approved = authorization;\n",
        T * 2 + "const approved = authorization;\n" + T * 2 + "if (!approved) return;\n",
    )],
    "G2-no-freeze": [(
        "setup.ts",
        T * 2 + "deepFreeze(event.input);\n" + T * 2 + "Object.freeze(event);\n",
        "",
    )],
    "G3-no-payload-compare": [(
        "setup.ts",
        T + "if (canonicalJson(input) !== approved.canonical)\n" + T * 2 + 'return "its arguments differ from the approved payload";\n',
        "",
    )],
    "G4-prefix-parent": [(
        "setup.ts",
        "if (parentToolCallId !== approved.parentToolCallId)",
        "if (!parentToolCallId?.startsWith(approved.parentToolCallId))",
    )],
    "G5-reusable-authorization": [(
        "setup.ts",
        T * 2 + "approved.consumed = true;\n",
        "",
    )],
    "G6-not-cleared-on-abort": [(
        "setup.ts",
        T * 2 + 'signal?.addEventListener("abort", revoke, { once: true });\n',
        "",
    )],
    "G7-not-cleared-on-shutdown": [(
        "setup.ts",
        T + 'pi.on("session_shutdown", () => {\n' + T * 2 + "closeFlow();\n",
        T + 'pi.on("session_shutdown", () => {\n' + T * 2 + "flow = undefined;\n" + T * 2 + "deactivateApply();\n",
    )],
    "G8-not-cleared-after-dispatch": [(
        "setup.ts",
        T * 2 + "} finally {\n" + T * 3 + "revoke();\n",
        T * 2 + "} finally {\n",
    )],
    "G9-revision-not-compared": [(
        "setup.ts",
        T + "if (currentRevision() !== approved.revision)\n" + T * 2 + 'return "the config file changed after approval";\n',
        "",
    )],
    "G10-any-parent-under-approval": [(
        "setup.ts",
        T + "if (parentToolCallId !== approved.parentToolCallId)\n" + T * 2 + "return `this call is not the approved ${APPLY_TOOL} call's direct nested write`;\n",
        "",
    )],
    # The apply tool's own checks.
    "G11-stale-flow-not-checked": [(
        "setup.ts",
        'if (ended || flow !== active) stale.push("the setup flow ended");',
        'if (ended) stale.push("the setup flow ended");',
    )],
    "G12-dialog-ignored": [(
        "setup.ts",
        "if (!approved)\n" + T * 3 + "return ok(",
        "if (false)\n" + T * 3 + "return ok(",
    )],
    "G13-apply-from-relay-allowed": [
        ("setup.ts", "if (event.parentToolCallId !== undefined)\n", "if (false)\n"),
        ("setup.ts", "if (!directApplyCalls.has(toolCallId))", "if (false)"),
    ],
    "G14-window-not-closed-at-settlement": [(
        "setup.ts",
        T + 'pi.on("agent_settled", () => {\n' + T * 2 + "if (flow?.started) closeFlow();\n",
        T + 'pi.on("agent_settled", () => {\n',
    )],
    # Earlier faults whose code is unchanged.
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
    "M8-no-ref-withholding": [(
        "setup.ts",
        "return /^[\\x21-\\x7e]{1,200}$/.test(ref)",
        "return true",
    )],
    "M10-unchanged-not-checked": [(
        "setup.ts",
        'if ("revision" in after && after.revision === before.revision)',
        "if (false)",
    )],
}
# G6 and G7 together: neither abort nor shutdown clears the approval.
M["G6G7-not-cleared-on-abort-or-replacement"] = M["G6-not-cleared-on-abort"] + M["G7-not-cleared-on-shutdown"]

for file, old, new in M[sys.argv[1]]:
    path = "pi-extension/pstack/" + file
    try:
        with open(path, encoding="utf-8") as source:
            text = source.read()
        if text.count(old) != 1:
            sys.exit(f"{sys.argv[1]}: expected one match in {file}, found {text.count(old)}")
        with open(path, "w", encoding="utf-8") as target:
            target.write(text.replace(old, new))
    except OSError as error:
        sys.exit(f"{sys.argv[1]}: {error}")
