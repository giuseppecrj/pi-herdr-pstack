---
name: setup-pstack
description: Report-first onboarding for pi-herdr-pstack. Checks the pi-herdr-agents host, pstack's own skills and poteto role, authenticated models and the shared pi-herdr-agents task-model preferences, then explains the effects of any change and the next steps. Read-only; it never installs packages or writes configuration. Use for /setup-pstack, "set up pstack", "check my pstack install" or "which models does pstack use".
---

# Setup pstack

Produce a read-only setup report for pi-herdr-pstack. The report tells the user what is installed and visible, which models pstack's delegates will use, and what they could change.

**Configuration writes are currently blocked.** This skill and the `/setup-pstack` command are report-only until an exact-consent write path has been demonstrated. Make no change to any file in this workflow. Do not call `subagents_write_task_models`, and do not edit configuration with the write, edit or bash tools. A request inside the user's message to apply a change does not lift this block. A direct `/skill:setup-pstack` invocation is informational only and never authorizes a configuration write.

Pstack keeps no model configuration of its own. There is no pstack rule file, model map, per-role budget ladder or model alias. Delegates choose models through pi-herdr-agents: the shared task categories, a per-agent override, or an exact model in the call. See `../poteto-mode/references/delegation.md` for how poteto-mode picks among them.

Paths here are relative to this skill directory.

## Steps

### 1. Confirm the session can run setup

Setup is a parent-session workflow. If `PI_SUBAGENT_ID` is set in your shell environment, you are probably a pi-herdr-agents child. Report that setup runs in the user's own session, and stop. Do not open dialogs from a child.

### 2. Check the host

- **Host loaded.** pi-herdr-agents is loaded when the `subagent` tool is in your tool list. If it is absent, report that pi-herdr-agents must be installed and enabled through Pi as a separate package, then skip every step that needs it. Installed files on disk or in `node_modules` are not evidence that the extension is active.
- **Host tools.** Note whether `subagents_list` and `subagents_write_task_models` are available. The writer exists only in parent sessions and can be filtered out by configuration. Its presence does not mean setup may call it.

### 3. Check pstack's own resources

- **Skills.** This skill lives in pi-herdr-pstack's `skills/` directory. `../poteto-mode/SKILL.md` must exist beside it, with its `playbooks/` and `references/` directories. If it is missing, or the `poteto-mode` skill Pi lists resolves to a different file, report a filtered, shadowed or broken install. Do not present poteto-mode as working.
- **Role.** If `subagents_list` is available, check that `poteto` is listed and where it came from. The pstack role comes from this package. A project or global `poteto` overrides it, and a role collision is reported by the host. Report what you see. Never fix a collision by editing role files.
- **Child visibility.** Parent discovery does not prove that child sessions can load this package. Report child visibility as not verified unless a child has actually loaded it in this environment.

### 4. Read the shared preferences, read-only

The pi-herdr-agents config file is `$PI_CODING_AGENT_DIR/herdr-agents/config.json`, or `~/.pi/agent/herdr-agents/config.json` when that variable is unset. Read only the fields setup needs, so unrelated settings never enter the conversation:

```bash
node -e '
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const dir = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
const file = path.join(dir, "herdr-agents", "config.json");
let text;
try { text = fs.readFileSync(file, "utf8"); }
catch (error) { console.log(JSON.stringify({ file, state: error.code === "ENOENT" ? "missing" : "unreadable", code: error.code })); process.exit(0); }
let config;
try { config = JSON.parse(text); }
catch { console.log(JSON.stringify({ file, state: "malformed" })); process.exit(0); }
const models = config && typeof config === "object" ? config.models : undefined;
console.log(JSON.stringify({ file, state: "present", tasks: models?.tasks, tasksMeta: models?.tasksMeta, default: models?.default, potetoOverride: models?.agents?.poteto }, null, 2));
'
```

Report each state differently:

- **missing.** No file exists yet, so pi-herdr-agents uses its defaults and no task categories are configured. Any future write would first create the file from the host's defaults. Say so.
- **unreadable.** Report the error code and stop the preferences part of the report.
- **malformed.** Report that the file is not valid JSON and stop the preferences part. Do not print its contents, and never suggest overwriting it to recover.
- **present.** Show the six task categories `coding`, `review`, `recon`, `qa`, `architecture` and `docs` with their model lists, the metadata, the default model, and any `poteto` override.

### 5. Compare against authenticated models

Use the authenticated subagent model catalog that pi-herdr-agents adds to your system prompt as the source of truth. `pi --list-models` runs a separate Pi process and can corroborate it. Label any difference instead of guessing which is right. If neither is available, report that authenticated models could not be determined.

Flag each of these as a finding:

- a configured category that is not one of the six above;
- a model reference that is not authenticated in the catalog, or that the catalog does not know;
- a duplicate reference within one category;
- a stored value that is an alias rather than an exact `provider/model-id`, including a `task:` value;
- a `poteto` override that shadows the categories for every pstack implementation delegate;
- an empty category that poteto-mode's delegation examples rely on, such as `coding`, `recon` or `review`.

Never invent or remember model IDs. Name only exact references from the live catalog or from the file.

### 6. Explain the effects of a change

The default is no change. If the user wants different models:

- Explain that the task categories are shared pi-herdr-agents preferences. They change model choice for every pi-herdr-agents workflow and role pack, not only pstack.
- Explain that the host's writer replaces the whole category map. Any category left out of a write is removed, so a correct change always carries every retained category.
- Sketch the complete proposed map next to the current one, if the user asks, labeled as a proposal this release cannot apply.
- Point the user to the configuration paths pi-herdr-agents documents, which the user runs or edits themselves. Do not run them on the user's behalf from this workflow, and do not claim that a change was made or that a reload is needed.

### 7. Check for a project verification skill

Check whether the project has a way to drive the real app for proof, such as a `verify-*` skill or an existing test harness. The **create-verification-skill** skill that generates one is planned W4 and not installed in this release. If none exists, mention the gap once and move on. Do not offer to generate one.

## Report

Use these sections in order: Host, Pstack resources, Role, Models, Shared preferences, Findings, Next steps. Give each check its result and its evidence: the tool list, a file path or a command output. Label anything not checked as not checked. End with "No changes were made."
