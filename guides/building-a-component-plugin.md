# Building a Component Plugin

This guide walks through building a Jeeves component plugin — an OpenClaw plugin that uses the `@karmaniverous/jeeves` library to maintain its TOOLS.md section and participate in platform content management.

## Prerequisites

- An OpenClaw plugin project (TypeScript, ESM)
- A Jeeves service with an HTTP health endpoint (`/status` or `/health`)
- `@karmaniverous/jeeves` installed as a dependency (not peer, not dev)

## Step 1: Add the Dependency

```bash
npm install @karmaniverous/jeeves
```

Each plugin bundles its own copy of the library. No shared singleton, no install-order constraints.

## Step 2: Implement the JeevesComponent Interface

The `JeevesComponent` interface is the contract between your plugin and the Jeeves platform:

```typescript
import type { JeevesComponent } from '@karmaniverous/jeeves';

const component: JeevesComponent = {
  // Identity
  name: 'watcher',        // Used to derive config directory
  version: '0.10.1',      // Your component's version
  sectionId: 'Watcher',   // H2 heading in TOOLS.md

  // Prime-interval refresh (seconds). Must be a prime number.
  // Primes reduce collision probability between multiple writers.
  refreshIntervalSeconds: 71,

  // Content generator — called on every refresh cycle
  generateToolsContent: () => {
    // Return the markdown content for your TOOLS.md section.
    // This is where you report live state: index stats, job counts,
    // search thresholds, whatever your component exposes.
    return [
      'Search index: 464,230 chunks across 24 inference rules.',
      '',
      '### Score Thresholds',
      '- Strong: >= 0.75',
      '- Relevant: >= 0.5',
      '- Noise: < 0.25',
    ].join('\n');
  },

  // Service lifecycle — core calls these during platform teardown
  serviceCommands: {
    stop: async () => { /* stop your service */ },
    uninstall: async () => { /* uninstall your service */ },
    status: async () => ({
      running: true,
      version: '0.10.1',
      uptimeSeconds: 86400,
    }),
  },

  // Plugin lifecycle — core calls these during plugin uninstall
  pluginCommands: {
    uninstall: async () => { /* clean up plugin artifacts */ },
  },
};
```

### Why Prime Intervals?

Four component plugins writing to the same file need to avoid collisions. Prime-second intervals prevent harmonic alignment — the closest pair (61 & 67) first collides at 68 minutes; all four align once every 247 days. File-level locking handles the rare collisions that remain.

Default intervals: server (61s), runner (67s), watcher (71s), meta (73s).

## Step 3: Initialize and Create the Writer

In your plugin's `register()` function (or equivalent startup path):

```typescript
import { init, createComponentWriter } from '@karmaniverous/jeeves';

// api is the OpenClaw plugin API
init({
  workspacePath: api.resolvePath('.'),
  configRoot: api.getConfig('configRoot'),  // e.g., 'j:/config'
});

const writer = createComponentWriter(component);
writer.start();

// On plugin shutdown:
// writer.stop();
```

### What Happens on Each Cycle

1. `generateToolsContent()` is called — your plugin produces its section content
2. The content is written to TOOLS.md as an H2 section (e.g., `## Watcher`)
3. `refreshPlatformContent()` runs — probes all service ports, reads content files, writes the Platform section, SOUL.md, and AGENTS.md managed blocks
4. Templates are copied to the config directory if they've changed
5. Version-stamp convergence ensures the highest library version wins

All of this is handled internally by the `ComponentWriter`. Your plugin only provides the content generator and lifecycle commands.

## Step 4: Config Directory

Core automatically derives your component's config directory from `configRoot` and your component name:

```
{configRoot}/jeeves-{name}/    → e.g., j:/config/jeeves-watcher/
```

You don't specify this path — core computes it. Access it via:

```typescript
const configDir = writer.componentConfigDir;
// → 'j:/config/jeeves-watcher'
```

Put your component-specific config here. The core config lives at `{configRoot}/jeeves-core/`.

## Step 5: Plugin Config Schema

Your OpenClaw plugin config must include `configRoot`:

```json
{
  "plugins": {
    "entries": {
      "jeeves-watcher-openclaw": {
        "config": {
          "apiUrl": "http://127.0.0.1:1936",
          "configRoot": "j:/config"
        }
      }
    }
  }
}
```

## Runtime Validation

`createComponentWriter()` validates the component descriptor at runtime:

- `refreshIntervalSeconds` must be a prime number
- `name`, `version`, `sectionId` must be non-empty strings
- `generateToolsContent` must be a function
- `serviceCommands` must provide `stop`, `uninstall`, and `status`
- `pluginCommands` must provide `uninstall`

If validation fails, the factory throws with a descriptive error. This catches misconfiguration at startup, not at the first write cycle.

## Testing Your Plugin

Test that your content generator produces valid markdown and that the writer integrates correctly:

```typescript
import { init, createComponentWriter, parseManaged } from '@karmaniverous/jeeves';
import { readFileSync, writeFileSync } from 'fs';

// Set up a temp workspace
init({ workspacePath: tmpDir, configRoot: tmpConfigDir });
writeFileSync(join(tmpDir, 'TOOLS.md'), '');

const writer = createComponentWriter(myComponent, { probeTimeoutMs: 100 });
await writer.cycle();

const content = readFileSync(join(tmpDir, 'TOOLS.md'), 'utf-8');
const parsed = parseManaged(content);
expect(parsed.sections.find(s => s.id === 'MySection')).toBeDefined();
```
