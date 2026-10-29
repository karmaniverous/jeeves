/**
 * Packed-consumer check for the library entry points (spec 5.1).
 *
 * @remarks
 * Run with `npm run check:packed` (which builds first). Packs the package,
 * installs the tarball into a temporary `moduleResolution: Bundler` project
 * and, in three stages that add optional peers one group at a time, proves
 * each entry point type-checks and imports with only the peers it needs:
 *
 * 1. no optional peers: the root and `/catalog`;
 * 2. plus `zod-openapi`: `/openapi`;
 * 3. plus `fastify` and `fastify-type-provider-zod`: `/fastify`.
 *
 * The optional peers are dev dependencies of this repo, so in-repo tests
 * can't prove their absence; this script is the only proof. It also checks
 * the tarball's file list. Exits non-zero on the first failure.
 *
 * @module
 */

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')) as {
  name: string;
  exports: Record<string, { types: string; import: string }>;
  peerDependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

/** One stage: peers installed before it, and the entry points it proves. */
interface Stage {
  label: string;
  peers: string[];
  entries: string[];
  /** Extra ESM code run after the imports, proving the entry point works. */
  probe?: string;
  /**
   * TypeScript type-checked with this and every earlier stage's imports,
   * proving values from one entry point type-check in another's API (a
   * `Catalog` declared once, not once per entry point's declarations).
   */
  typeProbe?: string;
}

/** A one-entry catalog every type probe passes across entry points. */
const PROBE_CATALOG = [
  `import { defineCatalog as probeDefine } from '${pkg.name}/catalog';`,
  `import { z as probeZ } from 'zod';`,
  `export const probeCatalog = probeDefine([{ name: 'ping', method: 'GET', path: '/ping', description: 'Ping.', response: probeZ.object({ ok: probeZ.boolean() }), auth: 'none', kind: 'read' }]);`,
].join('\n');

const stages: Stage[] = [
  {
    label: 'no optional peers',
    peers: [],
    entries: ['', '/catalog'],
    typeProbe: [
      `import { createPluginToolset } from '${pkg.name}';`,
      `export const probeTools = (descriptor: Parameters<typeof createPluginToolset>[0]) => createPluginToolset(descriptor, { apiUrl: 'http://127.0.0.1:1', catalog: probeCatalog, tools: { ping: true } });`,
    ].join('\n'),
  },
  {
    label: 'zod-openapi',
    peers: ['zod-openapi'],
    entries: ['/openapi'],
    typeProbe: [
      `import { buildOpenApiDocument } from '${pkg.name}/openapi';`,
      `export const probeDoc = buildOpenApiDocument(probeCatalog, { title: 'probe', version: '1.0.0' });`,
    ].join('\n'),
    probe: [
      `const { defineCatalog, standardEntries } = await import('${pkg.name}/catalog');`,
      `const { buildOpenApiDocument } = await import('${pkg.name}/openapi');`,
      `const doc = buildOpenApiDocument(defineCatalog(standardEntries('probe', { auth: { config: 'none' } })), { title: 'probe', version: '1.0.0' });`,
      `if (!doc.paths['/config/apply'].post) throw new Error('no operation');`,
    ].join('\n'),
  },
  {
    label: 'fastify',
    peers: ['fastify', 'fastify-type-provider-zod'],
    entries: ['/fastify'],
    typeProbe: [
      `import { registerCatalogRoutes } from '${pkg.name}/fastify';`,
      `import type { FastifyInstance } from 'fastify';`,
      `export const probeRoutes = (app: FastifyInstance) => registerCatalogRoutes(app, probeCatalog, { ping: () => Promise.resolve({ status: 200, body: { ok: true } }) });`,
    ].join('\n'),
    probe: [
      `const { default: Fastify } = await import('fastify');`,
      `const { defineCatalog, standardEntries } = await import('${pkg.name}/catalog');`,
      `const { registerCatalogRoutes } = await import('${pkg.name}/fastify');`,
      `const app = Fastify();`,
      `const [status] = standardEntries('probe', { auth: { config: 'none' } });`,
      `await registerCatalogRoutes(app, defineCatalog([status]), { status: () => Promise.resolve({ status: 200, body: { name: 'probe', version: '1', uptime: 0, status: 'healthy', health: {} } }) });`,
      `const res = await app.inject('/status');`,
      `if (res.statusCode !== 200 || res.json().name !== 'probe') throw new Error('route failed: ' + res.body);`,
      `await app.close();`,
    ].join('\n'),
  },
];

/** Every optional peer, none of which may be present before its stage. */
const optionalPeers = stages.flatMap((s) => s.peers);

/** Files the tarball must contain. */
const requiredFiles = [
  'package.json',
  ...Object.values(pkg.exports).flatMap((e) =>
    [e.import, e.types].map((p) => p.replace(/^\.\//, '')),
  ),
  'dist/cli/jeeves/index.js',
];
/** Directories the tarball must contain at least one file under. */
const requiredDirs = ['content/', 'skills/', 'skills-self-hosted/'];

/**
 * npm's CLI script, run through node. On Windows `npm` is a `.cmd` shim
 * that needs a shell, and passing arguments through a shell is deprecated
 * (DEP0190) and splits `-e` code at its spaces; npm ships beside node.
 */
const npmCli = join(
  dirname(process.execPath),
  'node_modules',
  'npm',
  'bin',
  'npm-cli.js',
);

/** Run node with arguments, inheriting stderr; throws on a non-zero exit. */
function node(args: string[], cwd: string): string {
  return execFileSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

/** Run npm, inheriting stderr; throws on a non-zero exit. */
function npm(args: string[], cwd: string): string {
  return existsSync(npmCli)
    ? node([npmCli, ...args], cwd)
    : execFileSync('npm', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      });
}

/** Quiet, script-free npm install flags. */
const INSTALL_FLAGS = [
  'install',
  '--no-audit',
  '--no-fund',
  '--ignore-scripts',
  '--loglevel=error',
];

/**
 * Type-check the consumer with `skipLibCheck: false`, returning only errors
 * in this package's declarations or the consumer's own file. Errors inside
 * third-party declarations (e.g. a peer's transitive dependency built for
 * another `@types/node`) are not this package's to fix.
 *
 * @param cwd - Consumer project.
 * @returns Error lines.
 */
function ownTypeErrors(cwd: string): string[] {
  let output = '';
  try {
    node([tsc, '-p', '.', '--pretty', 'false'], cwd);
  } catch (error) {
    output = (error as { stdout?: string }).stdout ?? '';
  }
  const ours = `node_modules/${pkg.name}/`;
  return output
    .split(/\r?\n/)
    .filter((line) => / error TS\d+:/.test(line))
    .filter((line) => {
      const file = line.replace(/\\/g, '/');
      return !file.includes('node_modules/') || file.includes(ours);
    });
}

/** Fail with a message. */
function fail(message: string): never {
  console.error(`check-packed-consumer: FAIL: ${message}`);
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'jeeves-packed-'));
console.log(`check-packed-consumer: working in ${work}`);

// Pack and check the file list.
const [packed] = JSON.parse(
  npm(['pack', '--json', '--pack-destination', work], repo),
) as { filename: string; files: { path: string }[] }[];
const files = new Set(packed.files.map((f) => f.path.replace(/\\/g, '/')));
for (const f of requiredFiles) if (!files.has(f)) fail(`tarball lacks ${f}`);
for (const d of requiredDirs)
  if (![...files].some((f) => f.startsWith(d))) fail(`tarball lacks ${d}`);
console.log(`check-packed-consumer: tarball ok (${String(files.size)} files)`);

// Consumer project.
const consumer = join(work, 'consumer');
mkdirSync(consumer);
writeFileSync(
  join(consumer, 'package.json'),
  JSON.stringify(
    {
      name: 'consumer',
      private: true,
      type: 'module',
      dependencies: { [pkg.name]: `file:${join(work, packed.filename)}` },
      devDependencies: { '@types/node': pkg.devDependencies['@types/node'] },
    },
    null,
    2,
  ),
);
writeFileSync(
  join(consumer, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      module: 'ESNext',
      moduleResolution: 'Bundler',
      target: 'ES2022',
      lib: ['ES2022'],
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      types: ['node'],
    },
    include: ['check.ts'],
  }),
);
npm(INSTALL_FLAGS, consumer);

const tsc = join(repo, 'node_modules', 'typescript', 'bin', 'tsc');
const proven: string[] = [];
const typeProbes: string[] = [];

for (const stage of stages) {
  if (stage.peers.length > 0) {
    npm(
      [
        ...INSTALL_FLAGS,
        ...stage.peers.map((p) => `${p}@${pkg.peerDependencies[p]}`),
      ],
      consumer,
    );
  }
  const installed = optionalPeers.filter((p) =>
    existsSync(join(consumer, 'node_modules', ...p.split('/'))),
  );
  const allowed = stages
    .slice(0, stages.indexOf(stage) + 1)
    .flatMap((s) => s.peers);
  const unexpected = installed.filter((p) => !allowed.includes(p));
  if (unexpected.length > 0)
    fail(`${stage.label}: unexpected peers present: ${unexpected.join(', ')}`);

  proven.push(...stage.entries);
  if (stage.typeProbe) typeProbes.push(stage.typeProbe);
  const specifiers = proven.map((e) => `${pkg.name}${e}`);
  writeFileSync(
    join(consumer, 'check.ts'),
    specifiers
      .map(
        (s, i) =>
          `import * as m${String(i)} from '${s}';\nvoid m${String(i)};\n`,
      )
      .join('') +
      [PROBE_CATALOG, ...typeProbes].join('\n') +
      '\n',
  );
  const typeErrors = ownTypeErrors(consumer);
  if (typeErrors.length > 0)
    fail(
      `${stage.label}: type check of ${specifiers.join(', ')} failed:\n${typeErrors.join('\n')}`,
    );
  try {
    node(
      [
        '--input-type=module',
        '-e',
        [
          ...specifiers.map((s) => `await import('${s}');`),
          stage.probe ?? '',
        ].join('\n'),
      ],
      consumer,
    );
  } catch {
    fail(`${stage.label}: runtime import of ${specifiers.join(', ')} failed`);
  }
  console.log(
    `check-packed-consumer: ${stage.label}: ${specifiers.join(', ')} ok`,
  );
}

console.log('check-packed-consumer: all stages passed');
