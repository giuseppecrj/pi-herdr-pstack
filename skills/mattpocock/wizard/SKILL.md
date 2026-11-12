---
name: wizard
description: Generate an interactive bash wizard that walks a human through steps only they can perform. Use when provisioning infrastructure, setting up credentials or CI secrets, walking an unfamiliar third-party dashboard, or running a one-off migration or cutover. Don't invoke this for steps the agent can perform itself.
---

# Wizard

A **wizard** is a bash script that walks a human, step by step, through a manual procedure that's tedious to do by hand and tedious to re-explain to an AI every time. It opens each URL, says exactly what to click and copy, captures the values, writes them where they belong (`.env`, GitHub secrets), confirms at every stage, and shows how many stages are left. It might configure third-party services, run a one-off migration, or move the project from one state to another.

The delightful UX is already solved by `template.sh`: stage-by-stage progress, confirmation gates, cross-platform URL opening (including WSL), hidden secret entry, idempotent `.env` upserts, `gh secret`/`gh variable` writes, and a closing summary. **Your job is only to scope the procedure and author its stages.** The library above the `STAGES` marker is identical in every wizard; that consistency is the point: never hand-edit it.

A wizard is ephemeral by default: built for one run, saved to a scratch or `scripts/` path, deleted when the job's done. Commit it only when the user wants a repeatable setup path that should live in the repo.

**The human runs the wizard, never you.** Never run the script, in whole or in part: don't execute it, `source` it, call its functions, or run the commands its stages would run (`gh secret set`, `gh variable set`, writes to `.env`, migrations, cutovers). It opens browsers, blocks on human input, and writes values and secrets that only the human sets. `bash -n` and `shellcheck` only parse it. Never write a secret value into the script: the human enters each one when it runs. Never read a live `.env` or `.env.*` file (`.env`, `.env.local`, `.env.production` and the like): even a read puts its values in your tool output. Find variable names only in non-secret sources: templates such as `.env.example`, `.env.sample` or `.env.template`, config schemas, workflow files and code references. Ask the user for any name you still lack, never for a value.

**Publishing needs the user's grant.** The tracker doc says how to publish, never whether. Pushing a branch; opening, editing, marking ready, merging or closing a pull request; creating, editing, commenting on, assigning, labelling or closing an issue; and creating a label each happen only when the user has authorized that effect: by naming it in their request, or by approving it when you ask. Invoking `/skill:wizard` grants no tracker or remote write. Loading a skill without the user invoking it, by the model or from another skill, grants nothing. Ask once, up front, naming any other writes this run needs and the repo; a grant covers what it names, for this session. Without it, keep the work local (local branches, drafts, and commits where the commit policy allows) and tell the user what is ready and waiting to be published. A child's brief names only the effects the user granted.

## Process

### 1. Scope the procedure

Work out every manual step the human must take and every value that gets captured along the way. Read the repo first, don't ask cold:

- For setup: `.env.example` (or `.env.sample`, `.env.template`), `README`, `docker-compose*`, framework config and config schemas, code that reads the environment, and `.github/workflows/*` (every `secrets.*` / `vars.*` reference is a value the wizard must produce). Never a live `.env` file.
- For a migration or transition: the current state, the target state, and the irreversible actions between them.

Then show the user the ordered list of stages and the values each produces, and confirm: they may add, drop, or reorder. If any value goes to a GitHub secret or variable, also show the exact repository it goes to (`<owner>/<repo>`; suggest one from `gh repo view --json nameWithOwner`, but never trust it unconfirmed, since `GH_REPO`, the directory or a fork's parent can change gh's default) and have the user confirm it.

**Done when:** every stage is named in order, and for each captured value you know (a) where the human gets it, (b) where it's written (`.env`, a GitHub secret, both, or nowhere; some stages are pure actions), and (c) whether it's secret (hidden entry) or public; and, when any value goes to GitHub, the user has confirmed the `<owner>/<repo>` it goes to.

### 2. Map each stage's journey

For each stage, write the precise path a human follows: which URL to open, what to do there, where a value is shown, which variable it fills: e.g. "Dashboard → Developers → API keys → Reveal test key → copy". Where you don't actually know the current UI or the exact command, say so and ask the user or check the docs: never invent steps that may not exist.

**Done when:** every stage traces to concrete instructions a stranger could follow.

### 3. Author the wizard

Copy `template.sh` to the target path. Replace the example stage with one `stage` per step, in dependency order. Use the library helpers: `stage`, `say`/`step`, `open_url`, `ask`/`ask_secret`, `write_env`, `set_secret`/`set_var`, `pause`/`confirm`. Set `TOTAL_STAGES` to the number of stages you wrote, and `REPO` to the `<owner>/<repo>` the user confirmed in step 1 (leave it empty when no stage writes to GitHub). The library passes `--repo "$REPO"` to every `gh secret set` and `gh variable set`, skips both when `REPO` is unset, and its intro shows the repository and asks the human to confirm it before the first stage.

Hold the bar the template sets: open the URL before asking for its value, use `ask_secret` for anything secret, `write_env` every persisted value, `set_secret` only the values CI actually needs, and `confirm` before any irreversible action. Each `stage` clears the screen so only the current step is visible: keep a stage to one focused task so nothing the human needs scrolls away. Don't touch the library above the marker.

### 4. Verify and hand off

- `bash -n <script>`; run `shellcheck` if available.
- `chmod +x <script>`.
- Don't run it yourself, end-to-end or in part: it opens browsers and blocks on human input. Trace it statically instead: every value from step 1 is captured and lands where step 1 said, every `set_secret` name exactly matches a `secrets.*` reference in CI, and `REPO` is the repository the user confirmed.
- Tell the user how to run it. If it's a repeatable setup path, commit it (where the commit policy allows) and link it from the README so the next person runs the script instead of asking an AI.
