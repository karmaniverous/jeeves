# Onboarding Checklist

## How this document works

> **Owner:** This is your onboarding checklist. Work through the tasks top to bottom. Report decisions and info directly to your assistant — it will update this document and carry out the corresponding setup steps itself, or tell you exactly what to run on your own host. If you get stuck on a step, just ask.
>
> **Assistant instructions:** This is the authoritative onboarding tracker. When the owner reports a decision or delivers information, update this document immediately: check off completed items (⬜ → ✅), record values in the **Answer** column, and note context in **Notes**. Never write a sensitive value (token, key, password, secret) here, not even temporarily: once jeeves-server is running, this document is served over the web. Record only that it was received and where it went. Keep this document current — it is the single source of truth for onboarding status.

Tasks are in dependency order. The **Owner** column shows who acts: 🧑‍💻 = the instance owner, 🤖 = automated by the assistant or its tooling.

---

## 0. Identity

> Who is your assistant? These are the first things it needs to know.

|  | # | Task | Owner | Notes | Answer |
| --- | --- | --- | --- | --- | --- |
| ⬜ | 0.1 | Choose a persona name | 🧑‍💻 | What users call the assistant (e.g. "Jeeves", "Alfred"). Used in chat responses, mention detection, and message attribution. |  |
| ⬜ | 0.2 | Choose a creature type | 🧑‍💻 | What _is_ the assistant? (e.g. "digital valet", "AI copilot", "ghost in the machine"). Shapes how the assistant describes itself. |  |
| ⬜ | 0.3 | Choose an emoji | 🧑‍💻 | Signature emoji (e.g. 🎩, 🤖, 🦊). Used as the acknowledgment reaction and identity fallback on Discord/Slack/Telegram. |  |
| ⬜ | 0.4 | Describe the vibe | 🧑‍💻 | Communication style (e.g. "formal and British", "casual and direct"). Complements SOUL.md for tone guidance. |  |
| ⬜ | 0.5 | Provide an avatar | 🧑‍💻 | Profile picture for dashboard and Control UI. URL, file upload, or skip for now. |  |

---

## 1. Slack (Priority 1 — Communication Channel)

> Your assistant needs a voice. It gets its own Slack app in your workspace.

|  | # | Task | Owner | Notes | Answer |
| --- | --- | --- | --- | --- | --- |
| ⬜ | 1.0 | Generate Slack app manifest | 🤖 | Assistant generates a JSON manifest using the persona name from §0.1. The manifest configures Socket Mode, bot scopes, and event subscriptions required by OpenClaw. | N/A |
| ⬜ | 1.1 | Create a Slack app | 🧑‍💻 | Go to [api.slack.com/apps](https://api.slack.com/apps) → _Create New App_ → _From a manifest_ → select JSON. Select your workspace. Paste the manifest from §1.0. | N/A |
| ⬜ | 1.2 | Install the Slack app | 🧑‍💻 | _Install to Workspace_ → authorize. Generates a bot token. | N/A |
| ⬜ | 1.3 | Collect bot token | 🧑‍💻 | _OAuth & Permissions_ → copy **Bot User OAuth Token** (starts with `xoxb-`). Keep it ready for §1.5; never paste it here or in chat. |  |
| ⬜ | 1.4 | Collect app-level token | 🧑‍💻 | _Basic Information_ → _App-Level Tokens_ → create a token with all three scopes: `connections:write`, `authorizations:read`, `app_configurations:write` → copy token (starts with `xapp-`). Keep it ready for §1.5; never paste it here or in chat. |  |
| ⬜ | 1.5 | Configure Slack channel | 🧑‍💻 | Run `openclaw channels add slack` (or `openclaw configure`) and paste both tokens when prompted; the prompt masks them. | N/A |
| ⬜ | 1.6 | Designate admin channel | 🧑‍💻 | Create or choose a channel (e.g. `#jeeves-admin`). Default destination for all assistant output — briefings, alerts, proactive messages. Invite the bot. |  |
| ⬜ | 1.7 | Verify Slack connectivity | 🤖 | Assistant says hello in the admin channel 👋 | N/A |

---

## 2. jeeves-server (Priority 2 — Rich Output Channel)

> The web portal gives your assistant a place to share documents, diagrams, and search results. Your team authenticates with Google Workspace accounts.

|  | # | Task | Owner | Notes | Answer |
| --- | --- | --- | --- | --- | --- |
| ⬜ | 2.1 | Create a GCP project | 🧑‍💻 | Go to [GCP → New Project](https://console.cloud.google.com/projectcreate). _Organization_ must show your domain. |  |
| ⬜ | 2.2 | Configure OAuth consent screen | 🧑‍💻 | Internal to your Workspace domain. | N/A |
| ⬜ | 2.3 | Create OAuth client credentials | 🧑‍💻 | For jeeves-server authentication. | N/A |
| ⬜ | 2.4 | List insiders (name + email) | 🧑‍💻 | Who should have authenticated access to the web portal? One email per line. |  |
| ⬜ | 2.5 | Configure jeeves-server | 🧑‍💻 | Add OAuth credentials and insiders to `jeeves-server`'s config file. Restart jeeves-server. | N/A |
| ⬜ | 2.6 | Verify portal access | 🧑‍💻 | Open your portal URL → sign in with Google → you should see this checklist. | N/A |

---

## 3. Google Workspace (Email, Calendar, Drive)

> A service account with domain-wide delegation lets the assistant access your team's email, calendar, and Drive on behalf of designated users — no shared passwords needed.

|  | # | Task | Owner | Notes | Answer |
| --- | --- | --- | --- | --- | --- |
| ⬜ | 3.1 | Create a Workspace account for the assistant | 🧑‍💻 | [Google Admin → Users](https://admin.google.com/ac/users) → _Add new user_. Use the persona name (e.g. `jeeves@yourco.com`). Keep the password out of this document and out of chat. |  |
| ⬜ | 3.2 | Enable APIs | 🧑‍💻 | Enable Gmail, Calendar, Drive, Contacts, Docs, and Sheets APIs in the GCP project from §2. | N/A |
| ⬜ | 3.3 | Create service account + key | 🧑‍💻 | Create a service account in the GCP project and record the **Client ID** here for §3.4. |  |
| ⬜ | 3.4 | Authorize domain-wide delegation | 🧑‍💻 | [Domain-wide Delegation](https://admin.google.com/ac/owl/domainwidedelegation) → _Add new_ → paste the **Client ID** from §3.3 and the following **scopes** (comma-separated, all on one line): `https://www.googleapis.com/auth/gmail.modify, https://www.googleapis.com/auth/calendar, https://www.googleapis.com/auth/drive, https://www.googleapis.com/auth/contacts, https://www.googleapis.com/auth/documents, https://www.googleapis.com/auth/spreadsheets` | N/A |
| ⬜ | 3.5 | List team email addresses to monitor | 🧑‍💻 | Whose email and calendar should the assistant have access to? One per line. |  |
| ⬜ | 3.6 | Configure email & calendar | 🧑‍💻 | Set up ingestion pipelines, register domain jobs. | N/A |
| ⬜ | 3.7 | Verify email & calendar access | 🤖 | First sync completes, calendar events visible. | N/A |

---

## 4. GitHub

> A dedicated GitHub account keeps bot commits and PR activity separated from your own.

|  | # | Task | Owner | Notes | Answer |
| --- | --- | --- | --- | --- | --- |
| ⬜ | 4.1 | Provide GitHub org name | 🧑‍💻 | The GitHub organization the assistant will operate in. It will own the scripts repo, if this instance uses one. |  |
| ⬜ | 4.2 | Create GitHub bot account | 🧑‍💻 | Using the Workspace email from §3.1. This login is the instance's own GitHub identity (`github.self`). |  |
| ⬜ | 4.3 | Invite bot to the org | 🧑‍💻 | Org People page → _Invite member_ → bot login → _Member_. Sign in as the bot, accept the invitation, and confirm it is listed under People. | N/A |
| ⬜ | 4.4 | Grant bot permissions | 🧑‍💻 | Minimum: org member allowed to create repositories (org _Member privileges_ → repository creation, at least private), and write on every repo it maintains. | N/A |
| ⬜ | 4.5 | Generate bot PAT and record it | 🧑‍💻 | Fine-grained (resource owner = the org; repository permissions Administration read/write to create repos, Contents, Pull requests, Issues and Workflows read/write; organization permission Members read) or classic with the `repo`, `workflow` and `read:org` scopes (see `jeeves-github`). Record it in config: `github.self` = bot login, `github.identities.<bot>.token` = PAT. | N/A |
| ⬜ | 4.6 | Create the scripts remote | 🤖 | If this instance uses a scripts repo: `gh repo create <org>/jeeves-scripts-<instance-name> --private --source <scripts dir> --remote origin --push`, then `gh auth setup-git`. **Repo already exists:** don't recreate it — attach `origin`, fetch, and check for local commits beyond the template before deciding how to proceed. |  |
| ⬜ | 4.7 | Verify scripts repo | 🤖 | The repo exists and is private; the local clone's remotes include `origin`; a test push to `origin` works. | N/A |

---

## 5. Additional Integrations

> Optional integrations based on your tooling. Tell the assistant what platforms your team uses.

|  | # | Task | Owner | Notes | Answer |
| --- | --- | --- | --- | --- | --- |
| ⬜ | 5.1 | Inventory everyday platforms | 🧑‍💻 | What does your team use? (Notion, Jira, HubSpot, Monday, Salesforce, etc.) |  |
| ⬜ | 5.2 | Social media accounts | 🧑‍💻 | Which accounts to monitor/create content for? (TikTok, Instagram, X, LinkedIn, YouTube) List handles. |  |
| ⬜ | 5.3 | Configure integrations | 🧑‍💻 | Each integration scoped and configured individually. | N/A |

---

## 6. Go-Live

|  | # | Task | Owner | Notes | Answer |
| --- | --- | --- | --- | --- | --- |
| ⬜ | 6.1 | Walkthrough & orientation | 🧑‍💻 | Review the portal, Slack bot, and current capabilities with anyone else who'll use the assistant. | N/A |
| ⬜ | 6.2 | Confirm core integrations | 🧑‍💻 | Email, calendar, Slack, GitHub all green. | N/A |
| ⬜ | 6.3 | First daily briefing delivered | 🤖 | Proof of life 🎩 | N/A |

---

## Summary

_Owner tasks:_

1. Identity: name, creature, emoji, vibe, avatar (§0)
2. Create & install Slack app, collect tokens, designate admin channel (§1)
3. Create GCP project, configure OAuth, list portal insiders (§2)
4. Create Workspace account for assistant (§3.1)
5. Authorize service account in Admin Console (§3.4)
6. List email addresses to monitor (§3.5)
7. Provide GitHub org name, create and invite the bot, grant its permissions (§4.1–4.4)
8. Inventory platforms & social accounts (§5)

_Everything else is the assistant acting on the owner's behalf, on the owner's own host._
