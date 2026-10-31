/**
 * Packed-consumer check for the library entry points (spec 5.1).
 *
 * @remarks
 * Run with `npm run check:packed` (which builds first). Packs the package
 * and checks the tarball's file list, then:
 *
 * 1. installs the tarball, and nothing else, into a temporary
 *    `moduleResolution: Bundler` project; proves npm installed none of the
 *    optional peers and no entry point's packed code reaches a scoped
 *    package it may not import (`entry-points.ts`); then proves each entry
 *    point type-checks and imports, stage by stage, adding each stage's
 *    peers first: the root and `/catalog` with no peers (a catalog client
 *    round-trips a request), then `/openapi` with `zod-openapi`, then
 *    `/fastify` with `fastify` (spec 5a.4);
 * 2. installs the tarball alone into a temporary global prefix and runs
 *    `/fastify` from that copy with the consumer project's own Zod and
 *    Fastify. A service installed globally beside the `jeeves` CLI may use
 *    that top-level copy, which resolves its imports from its own location,
 *    not the service's: it must need nothing at run time it can't resolve
 *    there, and catalog schemas from the service's Zod must validate
 *    through it (Decisions 88, 89).
 *
 * Exits non-zero on the first failure.
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

import { libraryEntries, scopedPackages } from '../entry-points.js';
import { packageNameOf } from '../rollup-plugin-entry-deps.js';

const repo = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')) as {
  name: string;
  exports: Record<string, { types: string; import: string }>;
  devDependencies: Record<string, string>;
};

/** One stage: the entry points it proves. */
interface Stage {
  label: string;
  entries: string[];
  /** Optional peers installed (from `devDependencies`) before the stage. */
  peers?: string[];
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
    label: 'root and catalog',
    entries: ['', '/catalog'],
    probe: [
      `const { createCatalogClient, defineCatalog } = await import('${pkg.name}/catalog');`,
      `const { z } = await import('zod');`,
      `const catalog = defineCatalog([{ name: 'ping', method: 'GET', path: '/ping/:id', description: 'Ping.', params: z.object({ id: z.string() }), response: z.object({ ok: z.boolean() }), auth: 'none', kind: 'read' }]);`,
      `let url = '';`,
      `const fetch = (u) => { url = String(u); return Promise.resolve(new Response(JSON.stringify({ ok: true, extra: 1 }), { status: 200, headers: { 'content-type': 'application/json' } })); };`,
      `const res = await createCatalogClient(catalog, { baseUrl: 'http://svc', fetch }).ping({ id: 'x' });`,
      `if (url !== 'http://svc/ping/x' || JSON.stringify(res) !== '{"ok":true}') throw new Error('client failed: ' + url + ' ' + JSON.stringify(res));`,
    ].join('\n'),
    typeProbe: [
      `import { createPluginToolset } from '${pkg.name}';`,
      `export const probeTools = (descriptor: Parameters<typeof createPluginToolset>[0]) => createPluginToolset(descriptor, { apiUrl: 'http://127.0.0.1:1', catalog: probeCatalog, tools: { ping: true } });`,
    ].join('\n'),
  },
  {
    label: 'openapi',
    entries: ['/openapi'],
    peers: ['zod-openapi'],
    typeProbe: [
      `import { buildOpenApiDocument } from '${pkg.name}/openapi';`,
      `export const probeDoc = buildOpenApiDocument(probeCatalog, { title: 'probe', version: '1.0.0' });`,
    ].join('\n'),
    probe: [
      `const { defineCatalog, standardEntries } = await import('${pkg.name}/catalog');`,
      `const { buildOpenApiDocument } = await import('${pkg.name}/openapi');`,
      `const { z } = await import('zod');`,
      `const echo = { name: 'echo', method: 'POST', path: '/echo', description: 'Echo.', body: z.object({ n: z.number() }), response: z.object({ n: z.number() }), auth: 'none', kind: 'write' };`,
      `const doc = buildOpenApiDocument(defineCatalog([...standardEntries('probe', { auth: { config: 'none' } }), echo]), { title: 'probe', version: '1.0.0' });`,
      `if (!doc.paths['/config/apply'].post) throw new Error('no operation');`,
      `const echoN = doc.paths['/echo'].post?.requestBody?.content?.['application/json']?.schema?.properties?.n;`,
      `if (echoN?.type !== 'number') throw new Error('echo body missing from the document: ' + JSON.stringify(echoN));`,
    ].join('\n'),
  },
  {
    label: 'fastify',
    entries: ['/fastify'],
    peers: ['fastify'],
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

/**
 * Probe run in the consumer project against the globally installed copy
 * (`ROOT` is its directory): proves the copy can resolve neither Fastify
 * nor `fastify-type-provider-zod`, imports `/catalog` and `/fastify` by
 * path, takes Zod and Fastify from the consumer (a separate copy of each,
 * as a service has), and exercises request validation of a schema built
 * with the consumer's Zod.
 */
const GLOBAL_PROBE = [
  `import { createRequire } from 'node:module';`,
  `import { join } from 'node:path';`,
  `import { pathToFileURL } from 'node:url';`,
  `const ROOT = process.env.JEEVES_ROOT;`,
  `const load = (p) => import(pathToFileURL(join(ROOT, p)).href);`,
  `const ours = createRequire(join(process.cwd(), 'package.json')).resolve('zod');`,
  `const theirs = createRequire(join(ROOT, 'package.json')).resolve('zod');`,
  `if (ours === theirs) throw new Error('one Zod copy: ' + ours);`,
  `for (const p of ['fastify', 'fastify-type-provider-zod']) { let found = false; try { createRequire(join(ROOT, 'package.json')).resolve(p); found = true; } catch {} if (found) throw new Error('global copy resolves ' + p); }`,
  `const { z } = await import('zod');`,
  `const { default: Fastify } = await import('fastify');`,
  `const { defineCatalog, standardEntries } = await load('${pkg.exports['./catalog'].import}');`,
  `const { registerCatalogRoutes } = await load('${pkg.exports['./fastify'].import}');`,
  `const entries = standardEntries('probe', { auth: { config: 'none' } });`,
  `const echo = { name: 'echo', method: 'POST', path: '/echo', description: 'Echo.', body: z.object({ n: z.number() }), response: z.object({ n: z.number() }), auth: 'none', kind: 'write' };`,
  `const catalog = defineCatalog([...entries.filter((e) => e.name === 'status' || e.name === 'configApply'), echo]);`,
  `const app = Fastify();`,
  `await registerCatalogRoutes(app, catalog, { status: () => Promise.resolve({ status: 200, body: { name: 'probe', version: '1', uptime: 0, status: 'healthy', health: {} } }), configApply: () => Promise.resolve({ status: 200, body: { applied: true, config: {} } }), echo: ({ body }) => Promise.resolve({ status: 200, body }) });`,
  `const ok = await app.inject('/status');`,
  `if (ok.statusCode !== 200 || ok.json().name !== 'probe') throw new Error('route failed: ' + ok.body);`,
  `const bad = await app.inject({ method: 'POST', url: '/config/apply', payload: { patch: 1 } });`,
  `if (bad.statusCode !== 400 || bad.json().issues?.[0]?.slot !== 'body') throw new Error('validation failed: ' + bad.body);`,
  `const echoed = await app.inject({ method: 'POST', url: '/echo', payload: { n: 1 } });`,
  `if (echoed.statusCode !== 200 || echoed.json().n !== 1) throw new Error('echo failed: ' + echoed.body);`,
  `const refused = await app.inject({ method: 'POST', url: '/echo', payload: { n: 'x' } });`,
  `if (refused.statusCode !== 400 || refused.json().issues?.[0]?.path?.[0] !== 'n') throw new Error('echo validation failed: ' + refused.body);`,
  `await app.close();`,
].join('\n');

/** Static and dynamic import specifiers in an ESM file. */
const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g;

/**
 * Bare packages an entry point's packed code reaches: its own imports and
 * those of every relative module it imports, transitively.
 *
 * @param file - The entry point's `.js` file.
 * @returns Package names.
 */
function reachedPackages(file: string): Set<string> {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const visit = (path: string): void => {
    if (seen.has(path)) return;
    seen.add(path);
    for (const [, spec] of readFileSync(path, 'utf8').matchAll(IMPORT_RE)) {
      if (spec.startsWith('.')) visit(resolve(dirname(path), spec));
      else if (!spec.startsWith('node:')) packages.add(packageNameOf(spec));
    }
  };
  visit(file);
  return packages;
}

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

// npm installs no optional peer, so the root and `/catalog` run without them.
for (const p of ['fastify', 'fastify-type-provider-zod', 'zod-openapi'])
  if (existsSync(join(consumer, 'node_modules', p)))
    fail(`${p} was installed with the tarball alone`);
console.log('check-packed-consumer: tarball alone installs no optional peer');

// No entry point's packed code reaches a scoped dependency it may not use.
const installedRoot = join(consumer, 'node_modules', ...pkg.name.split('/'));
for (const [name, { scoped }] of Object.entries(libraryEntries)) {
  const allowed: readonly string[] = scoped;
  const reached = reachedPackages(join(installedRoot, 'dist', `${name}.js`));
  const banned = scopedPackages.filter(
    (p) => reached.has(p) && !allowed.includes(p),
  );
  if (banned.length > 0) fail(`dist/${name}.js reaches ${banned.join(', ')}`);
}
console.log(
  'check-packed-consumer: entry points reach only their own scoped dependencies',
);

const tsc = join(repo, 'node_modules', 'typescript', 'bin', 'tsc');
const proven: string[] = [];
const typeProbes: string[] = [];

for (const stage of stages) {
  if (stage.peers)
    npm(
      [
        ...INSTALL_FLAGS,
        ...stage.peers.map((p) => `${p}@${pkg.devDependencies[p] ?? ''}`),
      ],
      consumer,
    );
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

// Global install, alone: the copy a globally installed service may share.
const prefix = join(work, 'global');
mkdirSync(prefix);
npm(
  [
    ...INSTALL_FLAGS,
    '--global',
    '--prefix',
    prefix,
    join(work, packed.filename),
  ],
  work,
);
const globalRoot = join(
  prefix,
  ...(process.platform === 'win32' ? [] : ['lib']),
  'node_modules',
  ...pkg.name.split('/'),
);
if (!existsSync(join(globalRoot, 'package.json')))
  fail(`global install: ${globalRoot} not found`);
try {
  execFileSync(process.execPath, ['--input-type=module', '-e', GLOBAL_PROBE], {
    cwd: consumer,
    env: { ...process.env, JEEVES_ROOT: globalRoot },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
} catch {
  fail('global install: /fastify probe failed');
}
console.log(
  "check-packed-consumer: global install: /fastify ok with no peers beside it, the consumer's Zod and Fastify",
);

console.log('check-packed-consumer: all stages passed');
