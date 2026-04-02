/**
 * `jeeves config [jsonpath]` — inspect effective shared CLI configuration.
 *
 * @remarks
 * Shows effective values and provenance using the shared precedence model.
 * Optional JSONPath filters the resolved config tree.
 */

import type { Command } from '@commander-js/extra-typings';
import { JSONPath } from 'jsonpath-plus';

import {
  initFromOptions,
  type ResolvedCliConfig,
  type WorkspaceOptions,
} from './cliDefaults.js';

/** Format a provenance tag. */
function provenanceTag(provenance: string): string {
  return `[${provenance}]`;
}

/** Whether a value is a resolved leaf with provenance. */
function isResolvedLeaf(value: unknown): value is {
  value: unknown;
  provenance: string;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    'provenance' in value
  );
}

/**
 * Build the effective shared CLI config tree.
 *
 * @param opts - Parsed CLI workspace/config-root options.
 * @returns Effective config tree with provenance on each leaf.
 */
export function buildEffectiveConfig(
  opts: WorkspaceOptions,
): ResolvedCliConfig {
  return initFromOptions(opts);
}

/** Print the full effective config tree by walking the resolved structure. */
function printEffectiveConfig(config: ResolvedCliConfig): void {
  console.log('Effective jeeves.config.json:');
  console.log('');

  for (const [section, entries] of Object.entries(config)) {
    for (const [key, leaf] of Object.entries(
      entries as Record<string, { value: unknown; provenance: string }>,
    )) {
      console.log(
        `  ${section}.${key}: ${JSON.stringify(leaf.value)} ${provenanceTag(leaf.provenance)}`,
      );
    }
  }
}

/**
 * Register the `jeeves config` command.
 *
 * @param program - Root Commander program.
 */
export function registerConfigCommand(program: Command): void {
  program
    .command('config')
    .description('Show effective shared configuration with provenance')
    .argument('[jsonpath]', 'JSONPath filter (e.g. $.core.workspace)')
    .option('-w, --workspace <path>', 'Workspace root path')
    .option('-c, --config-root <path>', 'Platform config root path')
    .action((jsonpath: string | undefined, opts: WorkspaceOptions) => {
      const effective = buildEffectiveConfig(opts);

      if (jsonpath) {
        const result: unknown = JSONPath({
          path: jsonpath,
          json: effective,
          wrap: false,
        });

        if (result === undefined) {
          console.log(`No config value for: ${jsonpath}`);
          return;
        }

        if (isResolvedLeaf(result)) {
          console.log(
            `${jsonpath}: ${JSON.stringify(result.value)} ${provenanceTag(result.provenance)}`,
          );
          return;
        }

        console.log(JSON.stringify(result, null, 2));
        return;
      }

      printEffectiveConfig(effective);
    });
}
