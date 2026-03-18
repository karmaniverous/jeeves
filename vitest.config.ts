import { readFileSync } from 'node:fs';

import { defineConfig, type Plugin } from 'vitest/config';

/** Vitest plugin to import .md files as default string exports. */
function mdPlugin(): Plugin {
  return {
    name: 'md-string',
    transform(_code: string, id: string) {
      if (!id.endsWith('.md')) return null;
      const content = readFileSync(id, 'utf-8');
      const escaped = content
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$');
      return {
        code: `export default \`${escaped}\`;\n`,
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [mdPlugin()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', '.rollup.cache'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});
