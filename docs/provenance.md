# Provenance

| Destination | Source | Status |
| --- | --- | --- |
| `agents/poteto.md` | pi-herdr-agents `agents/poteto.md` at `c2177dff835da44937e614e8a03d0405d442e848` | unchanged (byte-identical) |
| `LICENSE` | pi-herdr-agents `LICENSE` at the same commit | unchanged |

`poteto.md` first appeared in pi-herdr-agents' launch commit `4fa3f26`. Its text
contains no host-owned paths or bundled-ownership wording, so no adaptation was
needed. `test/fixtures/provenance.json` records the SHA-256 of each source blob
and destination; `npm test` fails on unreviewed drift and, when a
pi-herdr-agents checkout is available, compares each file to the source commit.

## New files

`pi-extension/pstack/{index,roles}.ts` (bridge adapted from pi-herdr-agents'
`examples/role-pack/extension.ts` and ADR-0003), package metadata, tests,
`README.md`, `THIRD_PARTY_NOTICES.md` and these documents are new.

No upstream pstack (pi-mimir `f07dd981f62c9c994a5d043ede67d6c63c721454` or
original Cursor `2cbf58508f40de470d7490b55c51d71241928fa2`) files are included
yet. Per-file provenance for them belongs with the later skill-port waves.
