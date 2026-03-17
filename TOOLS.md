# Jeeves Platform Tools

## Watcher

This environment includes a semantic search index (`watcher_search`) covering 464,227 document chunks.
**Escalation Rule:** Use `memory_search` for personal operational notes, decisions, and rules. Escalate to `watcher_search` when memory is thin, or when searching the broader archive (tickets, docs, code). ALWAYS use `watcher_search` BEFORE filesystem commands (exec, grep) when looking for information that matches the indexed categories below.
**Scan-first rule:** When a task involves structural queries (file enumeration, staleness checks, domain listing, counts), use `watcher_scan` instead of `watcher_search`. Scan does NOT use embeddings and does NOT accept a query string.
**Search-first rule:** When a task involves finding, reading, or modifying files in indexed paths, run `watcher_search` FIRST — even if you already know the file path. Search surfaces related files you may not have considered and catches stale artifacts. Direct filesystem access is for acting on search results, not bypassing them.

### Score Interpretation (see skill for detail):
* **Strong:** >= 0.75 — High confidence. Use directly.
* **Relevant:** >= 0.5 — Likely useful. Verify context before relying on it.
* **Noise:** < 0.25 — Discard. If all results are noise, broaden your query or try different terms.

### What's on the menu:
* **email-archive**: Email archive messages
* **email-cache**: Email cache entries
* **slack-message**: Slack channel messages with channel and author metadata
* **x-raw**: Raw X/Twitter content
* **meetings-transcript**: Meeting transcripts
* **meetings-manifest**: Meeting manifest files
* **meetings-register**: Meetings register
* **projects**: Project documentation and specs
* **jira-issue**: Jira issue metadata extracted from issue JSON exports
* **jira-sprint**: Jira sprint metadata
* **jira-comment**: Jira issue comments
* **jira-board**: Jira boards
* **jira-version**: Jira project versions
* **finance**: Financial documents
* **workspace**: OpenClaw workspace files (Jeeves operational data)
* **config**: Configuration files
* **ideas**: Ideas and brainstorming content
* **frontmatter-title**: Extract title from frontmatter (cross-cutting)
* **frontmatter-author**: Extract author from frontmatter (cross-cutting)
* **json-subject**: Extract title from JSON subject field (cross-cutting)
* **json-participants**: Extract participants from JSON (cross-cutting)
* **linkedin-thread**: LinkedIn messaging threads from Phantombuster inbox scraper
* **github-repo-source**: Source code files from GitHub repo clones
* **github-issue**: GitHub issue entity files
* **meta-current**: Live jeeves-meta .meta/meta.json files
* **meta-archive**: Archived jeeves-meta .meta/archive snapshots
* **meta-config**: jeeves-meta configuration file

### Indexed paths:
* `j:/config/**/*.{json,md,txt,yml,yaml}`
* `j:/domains/**/*.{json,md,txt,ts,js,jsx,tsx,py,rs,go,java,rb,sh,yml,yaml,toml,mmd,puml,html,css}`
* `j:/jeeves/**/*.{md,txt,json,ts,js,mmd,puml,yml,yaml}`
* `j:/tcs/**/*.{json,md,txt,ts,js,jsx,tsx,py,rs,go,java,rb,sh,yml,yaml,toml,mmd,puml,html,css}`
* `j:/centennial/**/*.{json,md,txt,ts,js,jsx,tsx,py,rs,go,java,rb,sh,yml,yaml,toml,mmd,puml,html,css}`
