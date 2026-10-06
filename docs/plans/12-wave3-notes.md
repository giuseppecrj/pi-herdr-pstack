# Wave 3 planning notes: contradictions and decisions needed

Read-only planning. No repository, installation, Herdr session, child agent or model was touched. Inputs: pstack `main` `e3e8bbe`, host `7d35371`, roles `3b75aa4`, Mimir `f07dd981`, Cursor `2cbf5850`.

## Source facts checked

- The inventory's W3 `sourceFiles` match `git ls-files` for every W3 directory in both pinned trees. There are no extra files and no scripts.
- Mimir and Cursor are byte-identical for all 24 principles, `tdd`, `correct`, `benchmark-checklist`, `blast-radius`, `bro`, `teach`, `unslop` and `typescript-best-practices/references/patterns.md`. They differ in `no-comments` (6 lines: Cursor `Task`/`subagent_type` versus Mimir `subagent`/`agent`), `technical-writing` (15 lines: Mimir adds an 8-item review checklist; Cursor uses `/technical-writing`), `typescript-best-practices/SKILL.md` (Cursor's boundary-validation row is stricter: "Parse … into a named domain type; `Record<string, unknown>` stops at that parse") and `agents/comment-sicko.md` (Mimir adds Pi frontmatter and `/skill:` syntax).
- Seven principles need reference-only edits. The other 17 can ship byte-identical.

## Contradictions with the brief, the inventory or earlier plans

1. **The `comment-sicko` description contradicts its behavior.** Mimir frontmatter says "Read-only pstack comment reviewer" with `tools: read, grep, find, ls, bash`. The body says it deletes comments and reports "touched files, deletion count". `no-comments` step 2 inspects "its report and **diff**". The role is an editor that has no `edit` tool, so it would have to edit through Bash. AGENTS.md forbids inferring read-only behavior from a read/bash allowlist. → **D1**.
2. **"No-comments as its skill" cannot mean a preload.** `no-comments` is the parent-side driver that spawns `comment-sicko`. If it were loaded into the child, it would tell the child to spawn itself, and the child has `spawning: false`. Native `skills:` preload also still sends a separate `/skill:` turn at host `7d35371` (`buildPromptArgs`), and that turn caused the W2 premature auto-exit. The draft uses no `skills:` key, with the role body as the methodology. → confirm in **D2**.
3. **W3 skills depend on W4 skills.** `teach` exists to run `how` and `why`. `no-comments` and `comment-sicko` need `how`/`why` for thin keeps and `architect` for shapes. `blast-radius` needs `how`/`why`/`arena`. `principle-prove-it-works` cites `show-me-your-work`, and `benchmark-checklist` cites the Hillclimb playbook. Under the "if ambiguous, delete" rule, an interim no-comments run without `how`/`why` will delete more than upstream does. → **D3**.
4. **`poteto-help` is Cursor-product content, and Mimir dropped it without saying so.** The Mimir README documents excluding `setup-pstack` and `make-bot-ui`, but not `poteto-help`. The Cursor file depends on Custom Modes, `/add-plugin`, `~/.cursor/rules/pstack-models.mdc`, reasoning budgets, `auto`/`inherit-parent` models, `subagent_type: "poteto-agent"`, cloud agents, `/loop`, `cursor-team-kit`, Cursor Plan Mode, cursor.com docs, and ten `docs/guide/*.md` pages that are in neither the inventory nor this package. Its routing table names 14 W4 skills. A port is effectively new authoring. → **D4, D5**.
5. **Cursor-only frontmatter.** `typescript-best-practices` declares `paths: ["**/*.ts", "**/*.tsx"]`, which the Pi 1.0.3 parser ignores. It also sets `disable-model-invocation: true` and says "Use when reading or editing any .ts file". In Pi it would therefore never load unless the user invokes it explicitly. The upstream hub does not route to it. → **D6**.
6. **`teach` names an "image-generation tool".** No such tool exists in Pi or pi-herdr-agents. The draft makes it conditional on a session tool and falls back to mermaid or ASCII.
7. **Inventory statuses are stale.** All 51 rows, including the shipped W2 rows `poteto-mode` and `setup-pstack`, still say `"status": "planned"`. No test checks `status`. The draft's C0 flips W2 to `shipped` and makes status drive the checks.
8. **Revision mismatch.** The brief says pstack `main` is at `0eedac1`. Local and `origin/main` are at `e3e8bbe`, which adds only `docs/research/host-stack-status.md` closeout lines. The product tree is the same.
9. **The W2 test pins host `e262c584`, not `7d35371`.** `SubagentParams` and task categories are identical at both. The repin is mechanical, but it is a fixture change and should be recorded.
10. **W2 content tests assume no role.** `test/content.test.ts` asserts that no `agents/` directory exists, that there is no `roles:discover`/`pi.events.on`, and that 17 skill files are packed. `skill-content.test.ts` bans `comment-sicko` and any `agent:` key, and requires every file to be over 1000 characters (`bro` is 267 bytes). The hub, `delegation.md`, setup skill, README, compatibility doc and `setup.ts` all say "pstack ships no named roles". W3 must change each of these together. They are listed in the draft.
11. **Plan 09 precedent.** The user removed the `poteto` role in favor of bare delegates. Plans 02, 03, 07 and the format audit still assign `comment-sicko` to pstack W3 as a role, and the brief requires one. A bare delegate whose reference prompt lives in `skills/no-comments/references/` would avoid all runtime changes and the startup gate. → **D2**.
12. **Possible licensing of derived content (not established).** `unslop` uses stable rule numbers with gaps (3, 5, 7…), which suggests it is derived from an external catalog of AI-writing tells. `technical-writing` summarizes Diátaxis (CC BY-SA), Google developer style, ASD-STE100 and Global English. Neither upstream credits a source. The reviewer should check for verbatim third-party text before ship. Attribution beyond the existing MIT notices is a user call. → **D10**.
13. **Minor items, kept as upstream.** `unslop`'s description says "Must always apply" but the skill is explicit-only; the hub routing supplies the "always". `blast-radius` mentions "Solid versus React" (Cursor's own stack), which is harmless as an example. The `comment-sicko` persona's first line ("Yes... Ha ha ha... Yes!") is kept. A W4 conflict to note now: `comment-sicko` has `spawning: false`, but if W4 `how`/`why` delegate to subagents, the role cannot run them.

## Decisions needed from the user

- **D1. Comment-sicko's write capability.**
  - Recommended: (a) a comment editor. Tools `read, grep, find, ls, bash, edit`; it runs in the caller's checkout while the parent waits; its description says it edits comments only and never application code.
  - (b) Report-only. The parent applies the deletions. This changes upstream behavior.
- **D2. Role or bare delegate.**
  - Recommended: confirm the planned pstack role, with no `skills:` preload, the body as the methodology, and a single-prompt start, behind the real-Herdr gate.
  - Alternative: a bare delegate with a reference prompt, which applies plan 09's precedent and adds no runtime change.
- **D3. W3 skills that depend on W4.**
  - Recommended: ship them in W3 with `planned W4` markers and the stated interim rules.
  - Alternative: move `teach` (and optionally `blast-radius`) to W4. This changes the inventory partition from 2+29+6+8+6.
- **D4. `poteto-help`.** Approve a Pi re-authoring that uses Cursor's structure and covers only shipped behavior. Its status is "adapted, Cursor primary, substantially rewritten". The alternative is deferring it to W4/W5, when the routing table can be complete.
- **D5. Help link target and unavailable features.**
  - Recommended link target: installed skill paths plus the public `github.com/giuseppecrj/pi-herdr-pstack` README. Alternative: no external links at all.
  - Also confirm how `/loop`, cloud-agent and Custom Mode recipes are handled. Recommended: drop them, or state "not available in Pi".
- **D6. `typescript-best-practices` and its `paths` key.**
  - Recommended: drop `paths`, stay explicit-only, and have the reconcile step add one hub routing line for `.ts`/`.tsx` work. This hub line is new; the upstream hub does not route it.
  - Alternative: make it model-invocable.
  - Also choose the boundary-validation wording. Recommended: Mimir's (primary). Alternative: Cursor's stricter row.
- **D7. Thin-content rule.** Approve replacing ">1000 chars" with "copied, or at least half the primary source's length unless explained".
- **D8. Setup report scope.** Recommended: fix only the false `Roles: none` line and point to `/subagent list`. Alternative: extend the resource report to all 37 skills plus the role, which is a small runtime change the draft treats as a non-goal.
- **D9. Fixture split and rename.** Approve splitting `wave2-forward-references.json` and `skill-provenance.json` into per-owner files, so that two parallel writers never share a fixture.
- **D10. Third-party attribution.** Decide whether `unslop`/`technical-writing` need extra attribution if the reviewer finds verbatim external text.
- **D11. Batch review.** Approve one fresh cross-family review per batch (four in total) plus a final synthesis review. The alternative is a single review of the integrated candidate, which is cheaper but weaker.
- **D12. Authority.** Approve the draft before any worktree, commit or Herdr run. W3 implementation remains unauthorized until then.

## Parent decisions (routine calls, taken 2026-10-06)

- D3: ship W3 skills that depend on W4 with `planned W4` markers and the stated interim rules; keep the 2+29+6+8+6 partition unless D4 moves `poteto-help`.
- D5: public link target is the pi-herdr-pstack README; recipes that rely on `/loop`, cloud agents or Custom Modes are dropped, not marked.
- D6: drop `paths`, keep `typescript-best-practices` explicit-only, add one hub routing line for `.ts`/`.tsx` work; Mimir wording for the boundary-validation row.
- D7: thin-content rule becomes "copied, or at least half the primary source's length unless explained".
- D8: setup report only corrects the roles line; no catalog probe.
- D9: split the two shared fixtures per owner before parallel work.
- D10: if a reviewer finds verbatim third-party text in `unslop` or `technical-writing`, add attribution in THIRD_PARTY_NOTICES.md; no action otherwise.
- D11: one fresh cross-family review per batch plus a final synthesis review, as in Waves 1 and 2.

## Open for the user

D1 (comment-sicko edits or reports), D2 (role or bare delegate), D4 (port `poteto-help` now as a re-authoring, or defer it), D12 (approval to start).

## User decisions (2026-10-06)

- D1: comment-sicko edits files (`read, bash, edit`), comments only.
- D2: bare delegate; the upstream role body becomes `skills/no-comments/references/comment-sicko.md`; no `agents/`, no role registration.
- D4: port `poteto-help` now as a Pi re-authoring.
- D12: approved. Implementation starts from the C0 checkpoint.

