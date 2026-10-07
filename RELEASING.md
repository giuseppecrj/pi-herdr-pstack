# Release guide

GitHub Actions publishes this package when the version in `package.json` changes on `main`. The release workflow (`.github/workflows/publish.yml`, adapted from pi-herdr-agents) reads the package name and version from `package.json`, validates the package, publishes to npm, creates a matching `vX.Y.Z` tag, and creates a GitHub Release with generated notes and a link to the npm package.

The published version must be unique on npm.

## Current state: 0.1.0, first public release

The `release/0.1.0` commit removes `"private": true` and sets the stable version
`0.1.0`. When it merges to `main`, the detect step sees the previous
`0.1.0-experimental.0` private manifest and the current public `0.1.0`, sets
`release=true`, and the workflow publishes `0.1.0`. The host,
`pi-herdr-agents@3.0.0`, must be published first: it is the peer baseline.

Before this release the package was private with a prerelease version. While a
package is private or its version is not a strict `major.minor.patch`, the
workflow's detect step reports a notice and sets `release=false`. Now that the
package is public with a stable version, the host workflow's rules apply: a
stable version must increase, an unchanged version does not release, and a
decrease fails.

Do not design a release that creates a GitHub Release without a successful npm publish for a new version. The workflow publishes first, then tags and creates the GitHub Release.

### Peer dependencies and `.npmrc`

The peers are `"pi-herdr-agents": ">=3.0.0"`,
`"@earendil-works/pi-coding-agent": "^1.0.3"` and `"typebox": "^1.3.27"` (the
`typebox` version Pi 1.0.3 resolves in `package-lock.json`). The repository
`.npmrc` keeps `legacy-peer-deps=true`, so `npm install` and `npm ci` here never
auto-install peers. Development and CI must not pull npm `pi-herdr-agents` by
accident: host checks use an explicitly selected checkout through
`PI_HERDR_AGENTS_HOST`, and the pinned Pi dev dependency supplies the runtime
and `typebox`. `.npmrc` is not packed, so it does not affect consumers. Pi users
still install and enable pi-herdr-agents themselves; a peer declaration does not
activate an extension.

## Prerequisites

You need:

- Permission to manage this repository's GitHub Actions settings and npm package access for `pi-herdr-pstack`
- A clean local `main` branch

Automated release gates (run by the workflow and required locally):

```bash
npm ci
npm run format:check
npm run lint
npm run check        # typecheck, lint, format:check, unit/contract tests
npm pack --dry-run
```

In GitHub Actions the optional checks skip because their variables are unset and no sibling pi-herdr-agents checkout exists: the real-writer, writer-gate, RPC setup and combined-host checks (`PI_HERDR_AGENTS_HOST`), roles coexistence (`PI_HERDR_ROLES_PACK`), legacy characterization (`PI_HERDR_AGENTS_LEGACY_HOST`), W1 file provenance and schema pins (`PI_HERDR_AGENTS_SOURCE`), and the upstream skill source-hash reproduction and scope inventory (`PSTACK_MIMIR_SOURCE`, `PSTACK_CURSOR_SOURCE`). A green CI run therefore proves only the self-contained checks. Run the full set locally before a release (see [Development](README.md#development)).

## First real release (done in 0.1.0)

These steps were completed on the `release/0.1.0` branch:

1. [x] Removed `"private": true` from `package.json`.
2. [x] Set the stable version with `npm version 0.1.0 --no-git-tag-version`, which regenerated `CHANGELOG.md` (the `0.1.0` section lists PRs #1 to #5 and their commits; nothing remains under Unreleased).
3. [x] Replaced the temporary `"*"` peer ranges with `"pi-herdr-agents": ">=3.0.0"`, `"@earendil-works/pi-coding-agent": "^1.0.3"` and `"typebox": "^1.3.27"`, and recorded the tested host `7d35371` (3.0.0 line), roles `2820591` and Pi `1.0.3` in [compatibility](docs/compatibility.md). The published `pi-herdr-agents@3.0.0` is the compatibility baseline.
4. [x] Ran the full checks against that host, the roles pack and the upstream sources:

   ```bash
   PSTACK_MIMIR_SOURCE=/path/to/mimir-pstack-reference \
   PSTACK_CURSOR_SOURCE=/path/to/cursor-pstack-reference \
   PI_HERDR_AGENTS_HOST=/path/to/role-free/pi-herdr-agents \
   PI_HERDR_ROLES_PACK=/path/to/pi-herdr-roles \
   PI_HERDR_AGENTS_SOURCE=/path/to/pi-herdr-agents \
   npm run check
   ```

5. Real-Herdr coverage: real child launches, child-scope resource visibility and worktree lifecycle are not covered by this repository's tests (see [compatibility](docs/compatibility.md)). They belong to the parent-owned sequential Herdr integration suite, run from inside Herdr with this pack installed beside the role-free host, one suite at a time. The Wave 4 gates G1 to G7 ran against host `7d35371`. Do not release from skipped Herdr tests.
6. [x] Confirmed the `npm pack --dry-run` contents (below). The release commit reaches `main` through a reviewed PR; merging it triggers the workflow.

For every release, confirm the package preview (126 files for 0.1.0) includes `package.json`, `README.md`, `CHANGELOG.md`, `RELEASING.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `docs/compatibility.md`, `docs/provenance.md`, the `pi-extension/pstack/` modules (`index.ts`, `config.ts`, `mode.ts`, `resources.ts`, `setup.ts`), and every shipped skill directory under `skills/` that the README inventory lists (including `poteto-mode`, `setup-pstack` and the comment-sicko bare delegate prompt under `skills/no-comments/references/`). Confirm it ships no named roles (no `agents/` or `roles/` directory) and contains no `docs/evidence/`, `docs/research/`, `docs/skill-inventory.json`, tests or fixtures, `.github/`, sessions, `.pi/` or local configuration.

## npm authentication

### Steady state: trusted publishing (tokenless)

npm trusted publishing (OIDC) is already configured for `pi-herdr-pstack`: GitHub Actions, owner `giuseppecrj`, repository `pi-herdr-pstack`, workflow filename `publish.yml`. Because the package name already exists on npm (as a placeholder), no bootstrap token is needed. No long-lived `NPM_TOKEN` is required.

The release job has `permissions.id-token: write`, runs on a GitHub-hosted runner, and uses the exactly pinned Node `26.3.0`, whose bundled npm supports trusted publishing. Publish stays tokenless: `npm publish --access public --provenance`.

When the repository secret `NPM_TOKEN` is absent, the publish step unsets `NODE_AUTH_TOKEN` and relies on OIDC. Once the package exists, the workflow fails if `NPM_TOKEN` is still configured, so steady-state releases cannot silently keep using a bootstrap credential. Manual dispatch runs only from `main`; other refs are rejected.

### Bootstrap path

The workflow keeps the host's bootstrap path: a temporary `NPM_TOKEN` may publish a package that does not yet exist on npm. It is not needed here because the package exists. Later version bumps use trusted publishing only. Do not add `NPM_TOKEN`: the workflow rejects it once the package exists.

## Publish a release

Choose the semantic version increment:

- `patch`: compatible bug fixes, such as `0.1.0` to `0.1.1`
- `minor`: compatible features, such as `0.1.0` to `0.2.0`
- `major`: breaking changes, such as `0.1.0` to `1.0.0`

Create the version commit without a local tag:

```bash
git fetch --tags --prune
npm version patch --no-git-tag-version
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore: release v$(node -p \"require('./package.json').version\")"
git push origin main
```

The `npm version` hook regenerates `CHANGELOG.md` with `auto-changelog`. Use `npm run changelog` to regenerate it without changing the version.

Replace `patch` with `minor` or `major` when appropriate. The push triggers the **Release** workflow, which installs dependencies, runs formatting, lint, typecheck and unit/contract tests, previews package contents, publishes to npm with provenance, creates and pushes the version tag, and creates the GitHub Release.

You can rerun a failed or incomplete release from **Actions → Release → Run workflow**. If npm already has `PACKAGE_NAME@VERSION`, the workflow reads that version's `gitHead` and continues only when it matches `GITHUB_SHA` (exact-commit retry). A foreign publish fails before tag or GitHub Release creation. Existing tags are verified to point at the release commit. The workflow does not create a GitHub Release for a version that still needs publish and failed to publish.

## Verify the release

After the workflow succeeds, inspect the published package:

```bash
npm view pi-herdr-pstack
```

Test installation through Pi, beside an installed role-free pi-herdr-agents (a peer declaration does not activate an extension). Install the pack where pi-herdr-agents children load packages too:

```bash
pi install npm:pi-herdr-agents
pi install npm:pi-herdr-pstack
```

## Troubleshooting

### The workflow ran but did not release

Check the detect job's notice. A private package, a prerelease version or an unchanged stable version is intentionally not released.

### Tag points to another commit

The workflow stops if the matching version tag already points to a different commit. Do not move or reuse release tags. Increment the package version and push a new release commit instead.

### npm rejects authentication

Confirm that the trusted publisher matches owner `giuseppecrj`, repository `pi-herdr-pstack`, and workflow `publish.yml`, that the job has `id-token: write`, and that the runner is GitHub-hosted. If a release reports that `NPM_TOKEN` is bootstrap-only, remove the secret and use the trusted publisher.

### npm reports that the version already exists

If the published `gitHead` does not match this commit, the workflow fails before tagging. npm versions are immutable: increment the package version and push a new release commit. If it is a retry of the exact same commit, the workflow skips publish and continues with tag/release.

### Initial branch creation did not release

A first push to a new branch has `github.event.before` all zeroes. The workflow treats that as `release=false`.
