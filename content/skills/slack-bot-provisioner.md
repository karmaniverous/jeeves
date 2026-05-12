---
name: slack-bot-provisioner
description: Provision a new Slack bot identity for Clawdbot on a fresh server. Guides through Slack App creation steps, collects tokens, writes local config/env, and verifies connectivity.
---

# Slack bot provisioner (per-bot server)

Use this when you are setting up **a new Clawdbot instance** that should have **its own Slack bot identity** (one Slack App per bot), and you want a repeatable guided setup.

This skill assumes:
- The user is a Slack workspace admin.
- Each bot runs on its own server with its own Gateway config.

## What can be automated vs not

**Automated (this skill):**
- Create local folders.
- Write a `slack.env` (bot token, signing secret).
- Patch the Clawdbot gateway config to enable Slack for this instance (user approves).
- Run a connectivity test (send a message to a channel).

**Not fully automatable (Slack-side):**
- Creating/installing the Slack App and granting scopes (UI/OAuth).
- Verifying event subscription URLs (requires public HTTPS endpoint).

## Recommended mode
Start with **outbound-only** (post messages) and expand to event subscriptions later.

## Quick start

1) Have the user do the Slack UI steps in `references/slack-app-checklist.md`.
2) Run the provisioning script:

- PowerShell:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/provision.ps1`

The script will prompt for:
- bot name
- Slack bot token (`xoxb-...`)
- Slack signing secret
- (optional) test channel id

## Files
- Script: `scripts/provision.ps1`
- Reference checklist: `references/slack-app-checklist.md`
- Reference scopes: `references/scopes.md`

## Secrets (best practices)
- **Do not** store secrets inside the skill folder (skills are meant to be shareable/publishable).
- Store secrets **per-instance** in the Clawdbot runtime directory (recommended):
  - `C:\Users\Administrator\.clawdbot\credentials\...`
- Prefer environment variables / local credential files loaded by the Gateway/service manager.
- Never paste Slack secrets into public chats.

## Safety notes
- Store secrets per-instance. Do not reuse tokens across bot identities.
- Avoid bot-to-bot loops: bots should ignore messages from other bots by default.
