---
summary: "CLI reference for `openclaw update` (safe-ish source update + gateway auto-restart)"
read_when:
  - You want to update a source checkout safely
  - You need to understand `--update` shorthand behavior
title: "update"
---

# `openclaw update`

Update OpenClaw using the install method that is actually on disk, then optionally restart the Gateway service.

If you installed via **npm/pnpm** (global install, no git metadata), `openclaw update` uses the package-manager flow from [Updating](/install/updating). If you are on a git checkout, it uses the repo update pipeline.

## Usage

```bash
openclaw update
openclaw update status
openclaw update wizard
openclaw update --channel beta
openclaw update --channel dev
openclaw update --tag beta
openclaw update --dry-run
openclaw update --no-restart
openclaw update --json
openclaw --update
```

## Options

- `--no-restart`: skip restarting the Gateway service after a successful update.
- `--channel <stable|beta|dev>`: set the update channel (git + npm; persisted in config).
- `--tag <dist-tag|version>`: override the npm dist-tag or version for this update only.
- `--dry-run`: preview planned update actions (channel/tag/target/restart flow) without writing config, installing, syncing plugins, or restarting.
- `--json`: print machine-readable `UpdateRunResult` JSON.
- `--timeout <seconds>`: per-step timeout (default is 1200s).

Note: downgrades require confirmation because older versions can break configuration.

## `update status`

Show the active update channel + git tag/branch/SHA (for source checkouts), plus update availability.

```bash
openclaw update status
openclaw update status --json
openclaw update status --timeout 10
```

Options:

- `--json`: print machine-readable status JSON.
- `--timeout <seconds>`: timeout for checks (default is 3s).

## `update wizard`

Interactive flow to pick an update channel and confirm whether to restart the Gateway
after updating (default is to restart). If you select `dev` without a git checkout, it
offers to create one.

## What it does

`openclaw update` is the single update entrypoint used by:

- the CLI
- the optional Gateway auto-updater (`update.auto`)
- doctor's interactive "update before repair" prompt

At runtime it detects the real install shape and follows that path:

- **git checkout at the OpenClaw package root** → run the git update pipeline
- **global npm/pnpm/bun install** → run a global package update for the detected package manager
- **unknown install shape** → stop and tell the operator to update via their package manager manually

When you switch channels explicitly (`--channel ...`), OpenClaw also keeps the install method aligned:

- `dev` → ensures a git checkout (default: `~/openclaw`, override with `OPENCLAW_GIT_DIR`), updates it, then reinstalls the global CLI from that checkout.
- `stable` / `beta` → installs from npm using the matching dist-tag.

## Git checkout flow

Channels:

- `stable`: fetch tags, resolve the latest non-beta tag, check it out detached, then build + doctor.
- `beta`: fetch tags, resolve the newest beta tag (or the newest stable tag if it is newer), check it out detached, then build + doctor.
- `dev`: stay on `main`, fetch upstream, preflight recent upstream commits, then rebase to the newest commit that passes preflight.

Implemented flow:

1. Verifies the directory is both a git checkout and the OpenClaw package root.
2. Requires a clean worktree (`git status --porcelain -- :!dist/control-ui/`).
3. For `dev`, verifies an upstream exists; if not, the update is skipped instead of guessing.
4. For `dev`, fetches `--all --prune --tags`, then looks at up to 10 recent upstream commits.
5. For `dev`, creates a temporary git worktree and runs **deps install + build + lint** against candidate commits until one passes; the real checkout rebases to that selected SHA.
6. For `stable` / `beta`, fetches tags and checks out the resolved release tag in detached HEAD.
7. Installs dependencies with the detected package manager.
8. Runs `build` and `ui:build`.
9. Runs `openclaw doctor --non-interactive --fix` under `OPENCLAW_UPDATE_IN_PROGRESS=1` so config migrations and unknown-key cleanup happen in the same pipeline without recursive update prompting.
10. Verifies Control UI assets still exist; if doctor removed/staled them, it runs `ui:build` once more as post-doctor repair.
11. After a successful core update, syncs plugins for the selected channel and updates npm-installed plugins.

### Plugin/channel semantics after core update

The implemented plugin phase is not just "update everything":

- `dev` channel switches plugins with bundled local sources over to bundled path installs and ensures those local paths are present in `plugins.load.paths`.
- `stable` / `beta` switch previously bundled-dev plugins back to npm installs when an npm spec exists.
- npm-installed plugins are then updated in place from their recorded install specs.
- Any plugin config changes caused by the sync are persisted back to `openclaw.json`.

## `--update` shorthand

`openclaw --update` rewrites to `openclaw update` (useful for shells and launcher scripts).

## Restart behavior

If the Gateway service is currently loaded and restart is enabled, `openclaw update` prepares a **detached temporary restart script** before it starts changing files. That script is platform-specific:

- Linux: `systemctl --user restart <unit>.service`
- macOS: `launchctl kickstart -k`, with bootstrap fallback
- Windows: scheduled-task restart with port-release polling

This matters because the updating CLI may be part of the running service tree. The restart helper is written outside the install root and launched detached so restart still works even if the update replaces package files or terminates the parent process.

If no detached helper can be prepared, OpenClaw falls back to the standard restart path.

## See also

- `openclaw doctor` (offers to run update first on git checkouts)
- [Development channels](/install/development-channels)
- [Updating](/install/updating)
- [CLI reference](/cli)
