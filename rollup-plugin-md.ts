import type { Plugin } from 'rollup';

/**
 * Rollup plugin that imports `.md` files as ES modules exporting
 * the file content as a default string.
 *
 * @remarks
 * This eliminates runtime filesystem dependencies for content files
 * that are bundled into consumer plugins. When a plugin bundles
 * `@karmaniverous/jeeves`, `import.meta.url` points to the consumer's
 * bundle, so `packageDirectorySync` finds the wrong `package.json`.
 * Inlining the content at build time sidesteps the issue entirely.
 */
export function mdPlugin(): Plugin {
  return {
    name: 'md-string',
    transform(code: string, id: string) {
      if (!id.endsWith('.md')) return null;
      const escaped = code
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$');
      return {
        code: `export default \`${escaped}\`;\n`,
        map: { mappings: '' },
      };
    },
  };
}
