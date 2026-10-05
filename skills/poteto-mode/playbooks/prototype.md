### Prototype

**You own the design decision, not the code. The prototype is a throwaway instrument. The real build follows Feature.**

The one playbook where the Laziness Protocol's "smallest change" and the verification bar invert. Speed over polish, code quality does not matter, no planning. The rigor is in picking the right design cheaply. Propose variations the user didn't ask for, throw an approach away and try another.

1. Scope the decision the prototype exists to make: which layout, which interaction, which density, or for an empirical fork which behavior, timing, or approach. No decision means no prototype. Route to Feature.
2. Gather references when the design space is open. Search for prior art with the search tools the session provides, summarize a moodboard of themes, palettes, and layouts, and let the user pick directions before building. Skip when the direction is set, or when no search tool is available, and say which.
3. Build throwaway in an isolated scratch directory, separate from production source and out of commits unless the user asks to keep it. For a visual decision, vanilla HTML/CSS/JS or the lightest stack that renders the idea, CDN deps, a dev server with hot reload. For a behavioral or timing decision, the smallest script that exercises the question. No production framework, no tests, no abstractions, and no dependency installs into the user's project.
4. When comparing alternatives, build them behind one switcher (buttons or a keypress), each variant labeled. This is **principle-exhaust-the-design-space** (planned W3) made cheap.
5. Verify on the matching surface. For a visual decision, screenshot each variant and drive the interaction with the browser or screenshot tooling the session provides. If none is available, say the visual comparison is unverified rather than describing renders you did not see. For a behavioral or timing decision, observe the thing you are deciding by logging the timing, printing the output, or watching the render. The observation is the test here, not an assertion.
6. Present alternatives, tradeoffs, and a recommendation. The output is the decision plus the throwaway artifact, not shippable code. Hand the chosen direction to Feature (`playbooks/feature.md`) for the real build, which owns the shape decision.

**Reply:** the variants explored, the evidence (screenshots for a visual decision, the observed output or timing for a behavioral one), tradeoffs, your recommendation, and the scratch path. Say plainly that the prototype is throwaway.
