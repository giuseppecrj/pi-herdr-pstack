# pi-herdr-pstack

> **Experimental, private, unpublished — Wave 1 foundation only.** This package
> currently contributes one role, `poteto`. The pstack skill inventory,
> `/setup-pstack` and `/poteto-mode` are planned for later waves and are **not**
> implemented here. Nothing is published or released.

A Pi role pack for [pi-herdr-agents](https://github.com/giuseppecrj/pi-herdr-agents).
pi-herdr-agents is the execution host; Herdr is the terminal multiplexer it runs
children in. This pack owns methodology and roles, never a child runner,
scheduler, model store, installer or shell-permission engine.

## Contents

| Resource | Kind | Notes |
| --- | --- | --- |
| `poteto` | role | Autonomous engineering agent moved unchanged from pi-herdr-agents. Spawns children through the host's `subagent` tool. |

`poteto` names no other role. It works without the optional pi-herdr-roles
pack; any delegation it performs is a bare
or caller-specified launch, not a hidden dependency on that pack's roles.

`poteto` does not yet declare `skills: poteto-mode`. That activation is added
only after the real `poteto-mode` skill ships and passes its load test.

## Prerequisites and installation

pi-herdr-agents is a peer dependency and an explicit Pi installation
prerequisite: **a peer declaration does not activate an extension**. Install and
enable both through Pi. Because both candidates are private and unpublished,
experiment only with local paths and an isolated agent directory:

```bash
export PI_CODING_AGENT_DIR=/tmp/pstack-experiment/agent
pi install /path/to/candidate/pi-herdr-agents
pi install /path/to/pi-herdr-pstack
```

Install the pack where pi-herdr-agents children load packages too (normally the
same user settings). Do not install it beside a host that still bundles
`poteto`; see [compatibility](docs/compatibility.md).

## How the role is registered

`pi-extension/pstack/roles.ts` listens synchronously for
`pi-herdr-subagents:roles:discover:v1`, registers `agents/` for `apiVersion`
1 only and unsubscribes on `session_shutdown`. It imports nothing from
pi-herdr-agents and copies nothing into user or project role directories.
Project and global `poteto.md` definitions override the package role as usual.

## Development

```bash
npm install          # .npmrc disables automatic peer installation
npm run check        # typecheck, lint, format:check, test
```

Tests use test-owned temporary agent, home and project directories, the pinned
`@earendil-works/pi-coding-agent@1.0.3` dev dependency CLI and a deterministic
offline faux provider. They never edit your Pi settings. A passing faux-provider
run is not evidence that a live model follows `poteto`'s instructions.

| Variable | Effect |
| --- | --- |
| `PI_HERDR_AGENTS_HOST` | Host package root for combined-host RPC checks; skipped when unset. |
| `PI_HERDR_ROLES_PACK` | Also install pi-herdr-roles to check coexistence; needs `PI_HERDR_AGENTS_HOST`. |
| `PI_HERDR_AGENTS_SOURCE` | pi-herdr-agents Git checkout for provenance reconstruction. Defaults to a sibling `../pi-herdr-agents` containing the source commit; skipped otherwise. |
| `PI_BIN` | Alternative Pi executable for RPC tests. |

`docs/plans/` contains the coordinated migration plans; it is not shipped.

## Provenance and license

See [provenance](docs/provenance.md). MIT; see [LICENSE](LICENSE) and
[third-party notices](THIRD_PARTY_NOTICES.md). Upstream pstack notices will be
added with the skills that require them.
