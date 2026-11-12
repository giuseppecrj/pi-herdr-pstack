### Eval

**You own the experiment design. Plan, blind, run, synthesize.**

**Non-negotiables for blinding:**

- No "eval", "test", "judge", "experiment", "rubric", "score", "compare", "benchmark", "candidate", or "arena" in any directory, file, or prompt the candidate sees.
- The candidate prompt looks like an organic user request. State the goal, not the meta.
- No chain-eliciting cues. Don't ask the candidate to list which skills, principles, or files they applied. Ask for design notes generally and grade chain-following from code shape, not self-report.
- Sanitize directory, slug and child names. Use project-shaped names a user might pick. A child's `name` and `worktree` branch are visible to it.
- Don't tell the candidate other candidates exist.
- The judge can know it's judging but sees outputs by sanitized label only, never by model name.
- Comparing two variants: one judge scores both sets in a single pass on one scale, blind to which set each came from.

**Steps:**

1. **Frame.** State what variant is under test and what behavior counts as success. Write the rubric (3-6 concrete criteria) for the judge only. Hold it back from candidates.
2. **Set up sanitized environments.** Per-candidate working dir with the variant in place. Plant any context an organic task would have: a project skeleton, the skills the candidate would naturally read.
3. **Author one organic prompt.** What a user would type. No leakage of what's being measured.
4. **Launch N candidates** on different models per the **arena** skill's Phase B. Launch them per `references/fan-out.md`: N independent bare children in one turn, each a diversity seat on an exact `provider/model-id` from a distinct family, each with its own sanitized `cwd`, the Implementer prompt from `references/delegation.md` as `systemPrompt` with `fork: false`, and the same organic prompt as `task`.
5. **Launch one blinded judge** on a different model family per the **arena** skill's Phase C. Launch one bare child with the Reviewer prompt from `references/delegation.md` on an exact model from a family no candidate used. Judge sees outputs by sanitized label and the rubric, never a model name. With too few families, follow the fallback in `references/fan-out.md` and report the blinding gate incomplete.
6. **Verify the chain from transcripts, not self-report.** Read each candidate's session file from the `Session:` path in its delivered result. For the parent session, use `$PI_SESSION_FILE`. For earlier sessions, follow the per-cwd session directory rule in `playbooks/session-pickup.md`, and never read another project's sessions. Look at which files each candidate actually opened. Grade chain-following from the files it really read plus the shape of the code, never from the candidate's own claims.
7. **Read every candidate output yourself** end to end. Compare to the judge's verdict. Disagreement means a model is biased or the rubric is ambiguous. Synthesize.

**Reply:** variant under test, rubric, per-candidate notes, judge's verdict, your synthesis, and a recommendation for whether to promote the variant.
