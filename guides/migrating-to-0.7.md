---
title: Migrating to 0.7.0
---

# Migrating to 0.7.0

0.7.0 is additive: nothing is removed and no signature changes, so code built against 0.6 keeps working. Packages pinned to `^0.6.0` stay on 0.6.x until they raise their range.

## New

- **`jeeves patch-openclaw [--dry-run]`** re-applies Jeeves' OpenClaw dist patches (today `tool-order`). `jeeves install` and `jeeves update` run it too (`--skip-patch` to opt out). It never restarts the gateway; after a live change it prints the restart notice. A patch OpenClaw no longer needs reports `upstream-fixed` (a success). It exits non-zero when a patch site is not found (e.g. an unsupported OpenClaw version) and must run as the user who owns the OpenClaw install. Replaces the `patch-openclaw` scripts in jeeves-scripts-template; `patch-also-allow-policy` is dropped (fixed upstream).
- **Platform skills** ship in the package: `skills/` (`jeeves-platform`, `jeeves-coding`, `jeeves-design`) and `skills-self-hosted/` (`jeeves-onboarding`). **`jeeves skills install|uninstall|status [--managed|--self-hosted] [--dry-run]`** wires them into `skills.load.extraDirs`; `install`/`update` pass `--managed`/`--self-hosted` through and otherwise keep the current mode. Remove old workspace copies of these skills, or they shadow the package's.
- **Bootstrap size report** after `jeeves install`, with `--strict`.
- **Script helpers** hoisted from jeeves-scripts-core: `parseRunnableArgs`, `argFlag`, `argValue`, `argOptional`, `positionalArgs`, `retryAsync`, `retrySync`, `exponentialBackoff`, `RetryPolicy`. `runWithRetry` is rebuilt on `retrySync` with the same behaviour.
- **`fetchJson`/`postJson`** abort after `DEFAULT_FETCH_TIMEOUT_MS` (120 s) unless the caller passes `init.signal` (which wins) or `{ timeoutMs }`. Check any call that legitimately runs longer.

## Prefer the new helpers

- `parseArgs`, `getArg`: prefer `parseRunnableArgs`.
- `getChannelWorkspace`: no remaining consumer.

These are not marked `@deprecated` in 0.7.0, so consumers linting with typescript-eslint `strictTypeChecked` can upgrade without changes. The tags arrive in 0.7.1 (#127).

## Managed instances (jeeves-tools)

Call `jeeves install --managed` / `jeeves update --managed`, run the patch step before restarting the gateway, and stop seeding `jeeves-platform`, `jeeves-coding` and `jeeves-design` into the workspace (see jeeves-tools#207, #208, #221).
