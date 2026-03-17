{{#if versionInfo}}
| Component | Service | Plugin | Core | Available |
|-----------|---------|--------|------|-----------|
{{#each versionInfo}}
| **{{name}}** | {{#if serviceVersion}}{{serviceVersion}}{{else}}—{{/if}} | {{#if pluginVersion}}{{pluginVersion}}{{else}}—{{/if}} | {{coreVersion}} | {{#if availableVersion}}⬆ {{availableVersion}}{{else}}✓ current{{/if}} |
{{/each}}
{{/if}}

### Service Health

| Service | Port | Status |
|---------|------|--------|
{{#each services}}
| {{name}} | {{port}} | {{#if healthy}}✅ Running{{#if version}} (v{{version}}){{/if}}{{else}}{{#if error}}⚠️ {{error}}{{else}}❌ Down{{/if}}{{/if}} |
{{/each}}

{{#if unhealthyServices}}
> **ACTION REQUIRED:** {{#each unhealthyServices}}{{name}}{{#unless @last}}, {{/unless}}{{/each}} {{#if (gt unhealthyServices.length 1)}}are{{else}}is{{/if}} unreachable. Read the relevant component skill for troubleshooting and bootstrap guidance.
{{/if}}

### Tool Hierarchy

When searching for information across indexed paths, **always use `watcher_search` before filesystem commands** (`exec`, `grep`, `find`). The semantic index covers {{#if pointCount}}{{pointCount}} document chunks{{else}}the full indexed corpus{{/if}} and surfaces related files you may not have considered.

Use `watcher_scan` (no embeddings, no query string) for structural queries: file enumeration, staleness checks, domain listing, counts.

Direct filesystem access is for **acting on** search results, not bypassing them.

### Shell Scripting

Default to `node -e` or `.js` scripts for `exec` calls. PowerShell corrupts multi-byte UTF-8 characters and mangles escaping. Use PowerShell only for Windows service management, registry operations, and similar platform-specific tasks.

### File Bridge for External Repos

When editing files outside the workspace, use the bridge pattern: copy in → edit the workspace copy → bridge out. Never write temp patch scripts. The workspace is the authoritative working directory.

### Gateway Self-Destruction Warning

⚠️ Any command that stops the gateway **stops the assistant**. Never run `openclaw gateway stop` or `openclaw gateway restart` without explicit owner approval. When approved, it must be the **absolute last action** — all other work must be complete first, all messages sent, all files saved.

### Messaging

**Same-channel replies:** Don't use the `message` tool. It fires immediately, jumping ahead of streaming narration. Just write text as your response.

**Cross-channel sends:** Use the `message` tool with an explicit `target` to send to a different channel or DM.

### Plugin Lifecycle

```bash
# Platform bootstrap (content seeding)
npx @karmaniverous/jeeves install

# Component plugin install
npx @karmaniverous/jeeves-{component}-openclaw install

# Component plugin uninstall
npx @karmaniverous/jeeves-{component}-openclaw uninstall

# Platform teardown (remove managed sections)
npx @karmaniverous/jeeves uninstall
```

Never manually edit `~/.openclaw/extensions/`. Always use the CLI commands above.

### Reference Templates

{{#if templatesAvailable}}
Reference templates are available at `{{templatePath}}`:

| Template | Purpose |
|----------|---------|
| `spec.md` | Skeleton for new product specifications — all section headers, decision format, dev plan format |
| `spec-to-code-guide.md` | The spec-to-code development practice — 7-stage iterative process, convergence loops, release gates |

Read these templates when creating new specs, onboarding to new projects, or when asked about the development process.
{{else}}
> Reference templates not yet installed. Run `npx @karmaniverous/jeeves install` to seed templates.
{{/if}}
