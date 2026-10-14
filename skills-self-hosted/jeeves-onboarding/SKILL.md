---
name: jeeves-onboarding
description: >
  State-driven, resumable walkthrough for setting up a new self-hosted Jeeves instance: identity, Slack, jeeves-server, Google Workspace, GitHub, and additional integrations. Use on first run, when the owner wants to set up Slack, Google or GitHub, or to resume onboarding.
---

# Instance Onboarding (Self-Hosted)

Interactive walkthrough for configuring a new self-hosted Jeeves instance. This skill is state-driven and resumable: it inspects live state on every activation and picks up where the owner left off.

## Onboarding Document

The authoritative tracker is the workspace `onboarding.md`. On first activation, if it doesn't exist, create it from this skill's `references/onboarding-checklist.md` template. On every later activation, read it to find where the owner left off.

**Rules for updating the checklist:**

- Check off completed items: ⬜ → ✅
- Record decisions and non-secret values in the **Answer** column as they are provided
- **Never write a secret into the checklist** (tokens, keys, passwords, PATs, SMTP URLs with credentials), not even temporarily: once jeeves-server is running, this document is served over the web and versioned by the watcher. Record only that it was received and where it went (e.g. `received; in instance config`). If someone pastes a secret in chat, tell them to rotate it.
- The checklist is the single source of truth for onboarding status

**Who does what:** there is no separate admin role here. Every step is something the owner does on their own host: edit the relevant component's config file under their `configRoot` (found via `jeeves config`), run `jeeves install` / `jeeves update` / `jeeves patch-openclaw`, and restart the affected service with its `{name}_service` tool (action `restart`) or its CLI (`jeeves-{name} service restart`). **Never restart the gateway yourself**; it ends your own session and can't come back from inside. Only restart it with the owner's explicit approval, as the last action, after every other step is done.

Paths are the instance's own: discover them with `jeeves config` (effective config with provenance) rather than assuming any fixed location.

## Phase 1 — Orient + Identity

1. Read the workspace `onboarding.md` (create it from the template if absent) to assess current state.
2. If §0 (Identity) is incomplete, prompt the owner for each missing item: persona name, creature type, emoji, vibe, avatar.
3. Record answers in the checklist. Identity values are written to `IDENTITY.md` on the instance.
4. If `jeeves-runner` is installed, verify core jobs are registered (`runner_jobs`).
5. Present a summary of what's done and what's next.

## Phase 2 — Slack (Priority 1 — Communication Channel)

The assistant needs a voice before anything else. Each assistant gets **its own Slack app** per workspace: never reuse another bot's app or tokens.

1. **Generate manifest (§1.0):** Produce the Slack app manifest by replacing `{{name}}` with the persona name from §0.1 in the following template. Provide the resulting JSON to the owner as a code block they can paste directly.

The canonical manifest template:

```json
{
  "display_information": {
    "name": "{{name}}",
    "description": "Slack connector for {{name}} (OpenClaw)"
  },
  "features": {
    "bot_user": {
      "display_name": "{{name}}",
      "always_online": true
    },
    "app_home": {
      "messages_tab_enabled": true,
      "messages_tab_read_only_enabled": false
    }
  },
  "oauth_config": {
    "scopes": {
      "bot": [
        "app_mentions:read",
        "channels:history",
        "channels:read",
        "chat:write",
        "chat:write.customize",
        "emoji:read",
        "files:read",
        "files:write",
        "groups:history",
        "groups:read",
        "im:history",
        "im:read",
        "im:write",
        "mpim:history",
        "mpim:read",
        "mpim:write",
        "pins:read",
        "pins:write",
        "reactions:read",
        "reactions:write",
        "users:read"
      ]
    }
  },
  "settings": {
    "org_deploy_enabled": false,
    "socket_mode_enabled": true,
    "token_rotation_enabled": false,
    "event_subscriptions": {
      "bot_events": [
        "app_mention",
        "channel_rename",
        "member_joined_channel",
        "member_left_channel",
        "message.channels",
        "message.groups",
        "message.im",
        "message.mpim",
        "pin_added",
        "pin_removed",
        "reaction_added",
        "reaction_removed"
      ]
    }
  }
}
```

**Do NOT modify this manifest.** Do not add slash commands, assistant views, home tabs, or extra scopes. This is the canonical minimal manifest for OpenClaw Socket Mode.

**Always present the manifest inside a code block** to prevent Slack from auto-linking `message.im` as a URL.

2. **Create & install app (§1.1–1.2):** Walk the owner through api.slack.com — _Create New App_ → _From a manifest_ → select JSON → paste → install to workspace.
3. **Collect tokens (§1.3–1.4):**
   - Bot token: _OAuth & Permissions_ → copy **Bot User OAuth Token** (starts with `xoxb-`).
   - App-level token: _Basic Information_ → _App-Level Tokens_ → create a token with **all three scopes**: `connections:write`, `authorizations:read`, `app_configurations:write` → copy (starts with `xapp-`).
   - Never ask the owner to paste either token into chat; collect them through the terminal step below.
4. **Configure (§1.5):** The owner runs `openclaw channels add slack` (or `openclaw configure`) on their own host. These commands prompt for the bot and app-level tokens and mask them as they're typed, so neither value ever reaches chat or shell history. OpenClaw applies the new channel config; restart the gateway only if asked, with the owner's approval, as the last action.
   - **Access policy:** the default `dmPolicy`/`groupPolicy` of `"open"` means every member of the workspace can DM the assistant and talk to it in any channel it's in, without pairing. Confirm with the owner that this is intended; a narrower policy is set in `channels.slack` via `openclaw config set`.
   - **Token check:** if the gateway doesn't connect, the owner can check a bot token with Slack's `auth.test` (`curl -s -H "Authorization: Bearer <token>" https://slack.com/api/auth.test` should return `"ok": true` and the bot's team).
   - **Second workspace:** a further Slack account (its own app, installed in the other workspace) is added the same way, as `channels.slack.accounts.<id>`. Jobs that post there pass that `accountId`.
   - **Bot loops:** bot-authored channel messages are dropped unless a channel sets `allowBots` (and the sending bot is in that channel's `users` allowlist). If enabled, keep OpenClaw's bot loop protection (`channels.slack.botLoopProtection`) on, or two assistants can reply to each other indefinitely.
5. **Admin channel (§1.6):** Owner creates/chooses a channel (e.g. `#jeeves-admin`), invites the bot.
6. **Verify (§1.7):** Assistant says hello in the admin channel.
7. **Enable Slack ingestion:** see the `jeeves-slack` skill (token source, `slack-poll` registration), if installed.

## Phase 3 — jeeves-server (Priority 2 — Rich Output Channel)

1. **GCP project (§2.1):** Owner creates a GCP project under their org domain.
2. **OAuth (§2.2–2.3):** Owner configures the OAuth consent screen (Internal) and creates client credentials.
3. **Insiders (§2.4):** Owner lists who should have authenticated portal access (name + email).
4. **Configure (§2.5):** Owner edits `{configRoot}/jeeves-server/config.json` (found via `jeeves config`) with the OAuth credentials and insiders, then restarts jeeves-server (`server_service` action `restart`, or `jeeves-server service restart`).
5. **Verify (§2.6):** Owner opens the portal, `https://<subdomain>.<baseDomain>`, and signs in with Google.

Once jeeves-server is operational, the onboarding checklist itself becomes visible in the web UI.

## Phase 4 — Google Workspace

A service account with domain-wide delegation provides API access to email, calendar, and Drive.

1. **Workspace account (§3.1):** Owner creates a Google Workspace user for the assistant (e.g. `jeeves@yourco.com`). Its password is never written to the checklist.
2. **Enable APIs (§3.2):** Owner enables Gmail, Calendar, Drive, Contacts, Docs, and Sheets APIs in the GCP project from §2.1.
3. **Service account (§3.3):** Owner creates a service account + key. Record the **Client ID** (not secret) in the checklist for §3.4. The key enables `gog`: it goes wherever this instance's scripts/runner setup reads `gogServiceAccountKey`/`gogAdminEmail` (check the `jeeves-email` and `jeeves-calendar` skills for the exact config file), then restart the affected service.
4. **Domain-wide delegation (§3.4):** Owner authorizes the Client ID with the scopes listed in checklist §3.4 (copy them from there; that list is authoritative).
5. **Email addresses (§3.5):** Owner lists which team members' email/calendar the assistant should access.
6. **Configure (§3.6):** Register the email and calendar jobs (see `jeeves-email`, `jeeves-calendar`).
7. **Verify (§3.7):** First sync completes, calendar events visible.

## Phase 5 — GitHub

A dedicated GitHub account keeps the assistant's commits and PR activity separate from the owner's own.

1. **Org name (§4.1):** Owner provides their GitHub organization name. It will own the scripts repo (`scriptsRepoOwner`), if this instance uses one.
2. **Bot account (§4.2):** Owner creates a GitHub account using the Workspace email from §3.1. This login becomes `github.self`.
3. **Invite bot to the org (§4.3):** Invite the bot as a _Member_. Sign in as the bot, accept the invitation, and confirm it is listed under the org's People.
4. **Bot permissions (§4.4):** Minimum: org member allowed to create repositories (org _Member privileges_ → repository creation, at least private), plus write on every repo it maintains.
5. **Bot PAT (§4.5):** Fine-grained (resource owner = the org; repository permissions Administration read/write for repo creation, Contents, Pull requests, Issues and Workflows read/write; organization permission Members read) or classic with the `repo`, `workflow` and `read:org` scopes (see `jeeves-github`). The owner records it as `github.self = <bot>` and `github.identities.<bot>.token` in their own config, so `gh` on the instance authenticates as the bot. The PAT never goes into the checklist.
6. **Scripts remote (§4.6, if this instance uses a scripts repo):** The owner (or the bot, scripted) creates the private remote:

   ```bash
   gh repo create <org>/jeeves-scripts-<instance-name> --private --source <this instance's scripts dir> --remote origin --push
   gh auth setup-git
   ```

   **If the repo already exists** (e.g. a re-provisioned instance), do not create it. Attach it and reconcile: add `origin`, `fetch`, then `git log --format=%s HEAD --not --remotes=template` to see local commits beyond the template. Nothing, or only trivial rename/lockfile commits, means it's safe to check out origin's default branch (`git checkout -B <branch> --track origin/<branch>`). Any other commit: stop and ask the owner how to reconcile (merge, rebase, or discard). Never force-push over the existing repo.

7. **Verify (§4.7):** The repo exists and is private; the local clone's remotes show `origin` (and `template`, if used); a push to `origin` works. Clone, push and PR creation work on the other repos the bot maintains.

## Phase 6 — Additional Integrations & Go-Live

1. **Platform inventory (§5.1):** Owner lists everyday tools (Notion, Jira, HubSpot, etc.).
2. **Social accounts (§5.2):** Owner lists handles to monitor/create content for.
3. **Configure (§5.3):** Each integration scoped and configured individually (domain skills: `jeeves-jira`, `jeeves-linear`, `jeeves-x`, ...).
4. **Walkthrough (§6.1):** Owner reviews the portal, Slack bot, and capabilities with anyone else who'll use the assistant.
5. **Confirm (§6.2):** All core integrations green.
6. **First briefing (§6.3):** Proof of life (see `jeeves-daily-briefings`, if installed).

## Checkpoint Behavior

This skill is **state-driven and resumable**. It does NOT maintain session-persistent state.

- On every activation, read the workspace `onboarding.md` to determine current state (create it from the template on first activation, if absent).
- If an item is already checked (✅), skip it.
- If a section is partially complete, pick up from the first unchecked item.
- Never assume prior session state; always inspect the checklist.
- The owner may configure some sections today and return for others tomorrow.

## Runner Job Registration

When registering a job with `runner_create_job`, carry over the full field set from its manifest: `script` (absolute path to the script on this instance, not a hard-coded location), `schedule` (as an RRStack JSON string, keeping every field), `env`/`args`, and `output_channel`/`on_failure`/`on_success` for Slack relay. Smoke-test a new job with `runner_trigger`, then check `runner_jobs` for its last status.

## Optional: SMTP for Magic-Link Auth

If the owner wants email-based magic-link authentication on jeeves-server (auth mode `'email'`):

1. Collect an SMTP URL (e.g. `smtps://user:pass@smtp.example.com:465`, a secret) and a from address, never written to the checklist.
2. Edit `{configRoot}/jeeves-server/config.json`: add `'email'` to `auth.modes`, and set `auth.email.smtpUrl` / `auth.email.fromAddress`.
3. Restart jeeves-server.
4. Verify: the login page shows "Sign in with email". Test with a real address.

Provisioning the SMTP provider (SES, Resend, Mailgun, Postmark, or any SMTP-compatible service) is the owner's own responsibility.

## Tools Reference

| Tool | Purpose |
| --- | --- |
| `exec` | Run shell commands (connectivity checks, `gh`, service queries) |
| `read` / `write` | Read and update onboarding.md and other workspace files |
| `runner_create_job` | Register a job from a manifest definition |
| `runner_jobs` | Query registered job states |
| `runner_trigger` | Trigger a job for smoke testing |
| `runner_enable` | Enable a registered job |
| `meta_seed` | Seed `.meta/` for a new content directory |

## Scope

This skill covers the **full onboarding lifecycle** for a self-hosted instance: identity, communication (Slack), rich output (jeeves-server), workspace APIs (Google), source control (GitHub), additional integrations, and go-live verification. On a managed instance, jeeves-tools seeds its own `jeeves-onboarding` instead, and this skill isn't wired.
