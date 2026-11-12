---
status: accepted
---

# Skills are grouped in folders by upstream

The pack merges two upstreams: Cursor pstack (`cursor/plugins` `pstack/skills`) and Matt Pocock's skills (`mattpocock/skills`). Skills live in `skills/pstack/`, `skills/mattpocock/` or `skills/merged/`. Each upstream folder maps to one pinned upstream commit, so the weekly sync compares each upstream against its own folder. A skill drawn from both sources lives once in `merged/` and records both sources, and a change to either source flags it for a manual merge. Pi discovers skill folders at any depth, so skill names stay unprefixed. Because Pi keeps only the first skill it discovers with a given name, a name must be unique across all folders.

## Consequences

- Relative links between skills cross folder boundaries and must be rewritten when skills move, then checked by a test.
