# Prompts worth copying

Swap in the real paths, skills, and done checks. Informal wording works. Paths are relative to the poteto-help skill directory. `/poteto-mode <task>` turns sticky mode on and sends the task. Type `/skill:poteto-mode <task>` instead for one request without the mode. A recipe marked planned W4 needs a skill or playbook that is not installed yet. Do not hand it out as working. Give the interim route from `../poteto-mode/SKILL.md` instead.

## Understand

- `/poteto-mode read <thread>. restate the underlying issue in your own words, in plain english.`
- `/poteto-mode investigate why <symptom>. give me what we know, what data you used, and your best hypotheses. don't change any code yet.`
- `use /skill:how to understand <subsystem>. then use /skill:why to find out why it broke recently.` (planned W4)
- `/skill:recall my work on <topic> from last week, then read <issue>.` (planned W4)
- `/skill:teach me why you implemented it this way and not <other way>. what did you trade off?`
- `/poteto-mode take over this branch. read the decision log, find what's done, and continue. don't redo finished work.`

## Build

- Bug: `/poteto-mode <symptom>. repro first, then fix and verify.`
- Bug in an app: `/poteto-mode repro this with /skill:verify-<app>. if it repros on main, fix it and show me a video as proof.`
- Bug with a cheap test: `/poteto-mode repro <bug> first. if there's a cheap test path, use /skill:tdd. then fix and rerun.`
- Feature: `/poteto-mode add <behavior>. <current output> stays byte-identical. verify both.`
- Refactor: `/poteto-mode move <code> into one module, zero behavior change. record the current output first and prove it's unchanged after.`
- Perf: `/poteto-mode <operation> takes <time> on <fixture>. trace it, fix the measured cause, show me before and after.`

## Design and plan

- `/poteto-mode prototype a few options for <feature>. take screenshots or videos for me to compare.`
- `/poteto-mode we need <feature>. use /skill:architect first, and answer open questions with prototypes. let me review before proceeding.` (planned W4)
- `/poteto-mode write a tutorial for how i would use <new package> first. then /skill:teach me why it beats the current one.`
- `ask /skill:arena for a second opinion on this thread and our approach.` (planned W4)
- `/poteto-mode turn this design into a plan. small verifiable PRs, each with its own verification steps.` (`../poteto-mode/playbooks/multi-phase-plan.md`, planned W4)
- `/poteto-mode plan the migration of <library> to <target>. small verifiable PRs. the result must match the original exactly, bugs included.` (`../poteto-mode/playbooks/multi-phase-plan.md`, planned W4)

## Review and ship

- `/skill:interrogate the whole branch, but skeptically. don't change anything yet. no nitpicks unless it's a real bug or regression.` Read the dismissals too. (planned W4)
- `/skill:swarm check every package under <dir> against its check script. one worker per package. one report.` (planned W4)
- `/poteto-mode open the pr. small ordered commits, evidence in the description.` Opening a PR is an external action. Send this only when you mean it, because the request is the authorization.
- `/poteto-mode babysit this pr. get it green.` For status only: `/poteto-mode check on pr <number>. anything outstanding?` (`../poteto-mode/playbooks/babysit.md`, planned W4)
- `/poteto-mode land the stack.` (`../poteto-mode/playbooks/shipping.md`, planned W4)

## Away and back

- `/poteto-mode im going to bed. <goal> in a fresh worktree off <base>. done means <checks>. keep a decision log. don't ask me before committing. keep going until done. if you're truly stuck after a few hours, stop and write up why.`
- `/skill:show-me-your-work catch me up on what you did last night.` Read its Attention section first. (planned W4)
- `/poteto-mode full autopilot on this queue. each item is independent.` (`../poteto-mode/playbooks/autopilot-full.md`, planned W4)
- `/poteto-mode autopilot these changes but stack them, don't ship. i'll land the stack.` (`../poteto-mode/playbooks/autopilot-stack.md`, planned W4)
- `/skill:reflect capture what we learned so the next run doesn't repeat it.` Approve only edits that change a future decision. (planned W4)
- `/skill:bro` restates the last reply in plain words.
