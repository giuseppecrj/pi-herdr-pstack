# Upstream skill format audit for Pi 1.0.3

Read-only audit of the pinned sources, not a claim that they are ported or shipped. Parent reran the probe against the actual Pi 1.0.3 loader after the QA report.

| Source set | Skills loaded | Zero diagnostics | Name warnings | Explicit-only skills |
| --- | --- | --- | --- | --- |
| Mimir fork `f07dd981f62c9c994a5d043ede67d6c63c721454` | 48/48 | 48 | 0 | 48 |
| Cursor original `2cbf58508f40de470d7490b55c51d71241928fa2` | 51/51 | 49 | 2 | 50 |
| Canonical: fork 48 + original setup/help/UI | 51/51 | 50 | 1 | 50 |

Canonical warning: `pstack/skills/make-bot-ui/SKILL.md:2` uses `name: Make Bot UI`. Pi loads it with an invalid-name warning; the intended port must use `make-bot-ui`. The original Cursor `poteto-mode` has the same issue, but the canonical fork version already fixes it.

Only canonical `setup-pstack` is model-invocable by default. The other 50 set `disable-model-invocation: true`; explicit-only is intentional supported metadata, not a format error. The QA narrative's 49/2 count was incorrect; the parent rerun and machine-readable results establish 50/1.

All 51 canonical descriptions are present (maximum 421 characters). Inventory source files exist. The parser silently ignores `paths` in typescript-best-practices; it does not implement Cursor path matching. Cursor's `mode: true` is likewise not a Pi activation mechanism.

The probe checks SKILL.md frontmatter, per-directory and whole-root loading, relative Markdown/backtick references in those entry files, and inventory file existence. It is not a complete nested-resource semantic checker. Template/glob source references in `why` are not missing concrete files. Separate inspection found stale repository-root-style paths in the multi-phase-plan playbook; they require adaptation when that W4 resource is ported.

## Operational readiness is a separate gate

Loading does not validate workflow tool calls or make Cursor instructions work in Pi. Known adaptations include obsolete `role`/parallel `tasks`/`chain` arguments, the `poteto-agent` name, Cursor Task/model-rule instructions, hidden optional tools, and duplicated runner/ledger helpers. The public `agent` parameter itself remains valid; its obsolete role name is the problem.

Ownership remains the approved plan: pstack's `comment-sicko` role comes in W3 with `no-comments`, not in pi-herdr-roles. W2 adapts only its two hubs/shared base resources; other skills and complex playbooks stay in W3/W4. These corrections supersede the QA narrative's contrary ownership/wave statements.

The existing W1 `poteto` was a generic host role, not the full pstack methodology. The user approved making it a thin adapter to the skill hub in W2, eliminating duplicated engineering instructions. This will be tested as runtime integration, not inferred from the format audit.

## Evidence

- `/tmp/pstack-format-audit/probe.mjs`: actual SDK `loadSkillsFromDir`/`parseFrontmatter` audit; source paths are pinned local checkouts.
- `/tmp/pstack-format-audit/results.json`: per-skill results for all three sets.
- `/tmp/pstack-format-audit/parent-rerun.log`: parent reproduction.
- `/tmp/pstack-format-audit/unresolved-backtick-paths.json`: additional reference candidates, requiring classification rather than treating every backtick as a file.

No repository skill was changed by this audit. No provider/model call, Herdr run, installation or user-configuration mutation occurred.
