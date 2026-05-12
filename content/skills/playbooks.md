---
name: playbooks
description: >
  Reusable operational workflow patterns for the Jeeves platform. Use when asked to
  set up a daily briefing for a person or team, create standing meeting ops (notes +
  agenda generation), replicate an existing workflow pattern for a new context, or
  understand how recurring intelligence/ops workflows are structured. Covers the
  full stack: content directory, TASK files, standing orders, runner jobs, dispatcher
  scripts, Slack channel integration, and meta synthesis.
---

# Playbooks

Proven, replicable operational patterns. Each playbook describes what it does, what
infrastructure it needs, and how to instantiate a new instance.

## Common Infrastructure

All playbooks share these building blocks:

| Component | Purpose |
|-----------|---------|
| **Content directory** | `{workspace}/../<silo>/<domain>/` — stores output files, `.meta/`, standing orders |
| **TASK file** | Markdown prompt that defines the LLM session's entire job |
| **Standing orders** | `standing-orders.md` — append-only file for persistent stakeholder preferences |
| **Dispatcher script** | TypeScript in `{configRoot}/jeeves-core/scripts/src/` — reads TASK, spawns worker |
| **Runner job** | jeeves-runner job with cron schedule, timezone, and rrstack |
| **Slack channel** | Delivery surface — summary posts, quick-link pins, feedback loop |
| **Meta entity** | `.meta/` directory seeded so jeeves-meta synthesizes context over time |

### Dispatcher Pattern

All dispatchers use `taskFileDispatcher` from `dispatchers/lib/task-file-dispatcher.ts`:

```typescript
import { taskFileDispatcher } from '../dispatchers/lib/task-file-dispatcher.js';

taskFileDispatcher({
  scriptName: '<silo>/<job-name>',
  jobId: '<runner-job-id>',
  taskFile: '<path-to-TASK.md>',
  timeout: 600,
  injectDateContext: true,
  dateTimezone: '<IANA timezone>',
});
```

`injectDateContext: true` prepends an authoritative date line so the LLM knows today's date.

### Standing Orders Convention

- Append-only — never modify existing entries
- TASK files instruct the LLM to read standing orders at Step 0
- TASK files instruct the LLM to append new persistent preferences from channel feedback
- Include initial configuration section with participants, timezones, channel rules

## Available Playbook Patterns

| Pattern | Description |
|---------|-------------|
| **Daily Briefing** | Recurring intelligence or action-item report for a stakeholder |
| **Standing Meeting Ops** | Post-meeting notes + next-day agenda generation for a recurring meeting |

## Instantiation Checklist

When creating a new playbook instance:

1. Choose the appropriate pattern from the table above
2. Create the content directory with `.meta/` and `standing-orders.md`
3. Write the TASK file(s) — adapt from an existing instance. Ensure Step 0 reads feedback from the *delivery channel* (where output is posted), not only a DM
4. Write the dispatcher script(s) in `{configRoot}/jeeves-core/scripts/src/<silo>/`
5. Register the runner job(s) with appropriate cron, timezone, rrstack
6. Set up the Slack channel — pin a quick-links message if the pattern calls for it
7. Seed `.meta/` so meta synthesis begins
8. Test with `--dry-run` before going live
