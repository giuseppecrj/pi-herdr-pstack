---
status: accepted
---

# pi-mimir is frozen at its pin, not synced

Many `skills/pstack/` files were adapted from `casualjim/pi-mimir`, the earlier Pi port of pstack, and their provenance records cite it at `f07dd981`. The maintainer decided not to track pi-mimir: the weekly sync follows only `cursor/plugins` and `mattpocock/skills`, `npm run upstream:drift` leaves pi-mimir out unless it is named with `--upstream`, and its pin never moves. Its provenance stays as a historical record of where the adaptations came from. Changes pi-mimir makes after the pin reach this pack only if Cursor's pstack makes them too, or if the maintainer asks for a one-off review.

## Consequences

- Provenance hashes for pi-mimir sources are still checked against the frozen pin when a `PSTACK_MIMIR_SOURCE` clone is available.
- Recorded pi-mimir files can drift from their upstream without a report. That is accepted.
