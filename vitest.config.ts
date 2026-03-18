import { defineConfig, type Plugin } from 'vitest/config';

/** Vite plugin to import .md files as string default exports. */
function mdPlugin(): Plugin {
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
