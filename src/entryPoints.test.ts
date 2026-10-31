/**
 * Each entry point exports exactly what spec §5 Design 5.1 lists (dev-plan
 * step 16): values and types, read with the TypeScript checker. The root is
 * every 0.7.0 export (from the verbatim 0.7.0 declarations) plus the two
 * types 0.8.0 adds.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const src = import.meta.dirname;

const ENTRIES = {
  root: 'index.ts',
  catalog: 'catalog/index.ts',
  openapi: 'openapi/index.ts',
  fastify: 'fastify/index.ts',
} as const;

const oldDeclarations = readFileSync(
  join(src, 'test', 'baseline-0.7.0', 'api-0.7.0.d.ts'),
  'utf8',
);
const rootAt070 = [
  ...oldDeclarations.matchAll(/^export (?:type )?\{([\s\S]*?)\};?$/gm),
].flatMap((m) =>
  m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

/** Spec 5.1, as amended 2026-10-28 and 2026-10-29 (#149, #151). */
const EXPECTED: Record<keyof typeof ENTRIES, string[]> = {
  root: [
    ...rootAt070,
    'CatalogToolSelection',
    'PluginContext',
    'computeInsiderKey',
    'computeOutsiderKeyWithExpiry',
    'computePathKey',
    'unknownArgs',
    'valuelessArgs',
  ],
  catalog: [
    'AuthScheme',
    'AuthSpec',
    'Catalog',
    'CatalogClient',
    'CatalogClientError',
    'CatalogClientErrorDetails',
    'CatalogClientOptions',
    'CatalogDefinitionError',
    'CatalogEntry',
    'CatalogInput',
    'CatalogRequest',
    'CatalogResponse',
    'CatalogToolAnnotations',
    'CatalogToolDefinition',
    'CatalogToolOptions',
    'CatalogTransport',
    'ClientAuth',
    'ClientResponse',
    'Credential',
    'EntryKind',
    'ErrorBody',
    'HttpTransportOptions',
    'IsJsonEntry',
    'Secret',
    'SlotInput',
    'attachCredential',
    'buildCatalogRequest',
    'catalogToolDefinition',
    'createCatalogClient',
    'credentialOf',
    'defineCatalog',
    'errorBodySchema',
    'httpTransport',
    'queryArray',
    'standardEntries',
    'toToolName',
    'toolInputToRequest',
    'toolResultFromResponse',
  ],
  openapi: [
    'OpenApiDocument',
    'OpenApiDriftResult',
    'OpenApiInfo',
    'buildOpenApiDocument',
    'checkOpenApiDrift',
    'writeOpenApiDocument',
  ],
  fastify: [
    'CatalogHandler',
    'CatalogHandlers',
    'CatalogRouteLogger',
    'CatalogValidationIssue',
    'ErrorStatus',
    'HandlerResult',
    'RegisterCatalogRoutesOptions',
    'RequestInput',
    'ResponseHeaders',
    'SlotValue',
    'StandardCatalogHandlers',
    'StandardHandlerSources',
    'SuccessStatus',
    'registerCatalogRoutes',
    'registerOpenApiRoute',
    'standardHandlers',
  ],
};

const files = Object.values(ENTRIES).map((e) => join(src, e));
const program = ts.createProgram(files, {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
  strict: true,
  skipLibCheck: true,
  resolveJsonModule: true,
  noEmit: true,
});
const checker = program.getTypeChecker();

/** Every export name (value or type) of a source file, sorted. */
function exportNames(file: string): string[] {
  const sourceFile = program.getSourceFile(file);
  if (!sourceFile) throw new Error(`not in program: ${file}`);
  const symbol = checker.getSymbolAtLocation(sourceFile);
  if (!symbol) throw new Error(`no module symbol: ${file}`);
  return checker
    .getExportsOfModule(symbol)
    .map((s) => s.name)
    .sort();
}

describe('entry-point exports (spec 5.1)', () => {
  it.each(Object.entries(ENTRIES))(
    '%s exports exactly its 5.1 list',
    (name, entry) => {
      expect(exportNames(join(src, entry))).toEqual(
        [...EXPECTED[name as keyof typeof ENTRIES]].sort(),
      );
    },
    60_000,
  );
});
