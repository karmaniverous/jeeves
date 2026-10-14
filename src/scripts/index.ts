/**
 * Script utilities — filesystem helpers, shell execution, crash handling,
 * Google auth, and Slack workspace resolution.
 *
 * @packageDocumentation
 */

export {
  argFlag,
  argOptional,
  type ArgSpec,
  argValue,
  type ArgValueOptions,
  type FlagSpec,
  type OptionalSpec,
  type ParsedArgs,
  parseRunnableArgs,
  positionalArgs,
  type ValueSpec,
} from './args.js';
export {
  appendJsonl,
  ensureDir,
  getArg,
  loadEnvFile,
  nowIso,
  parseArgs,
  readJson,
  readJsonl,
  sleepAsync,
  sleepMs,
  uuid,
  writeJsonAtomic,
  writeJsonl,
} from './fs-utils.js';
export {
  type AccountConfig,
  createGoogleAuth,
  type GoogleAuthOptions,
  type ServiceAccountFileConfig,
} from './google-auth.js';
export {
  exponentialBackoff,
  retryAsync,
  type RetryPolicy,
  retrySync,
} from './retry.js';
export { runScript } from './run-script.js';
export {
  type RetryOptions,
  run,
  type RunOptions,
  runWithRetry,
} from './shell.js';
export {
  getChannelWorkspace,
  saveCache,
  type SlackWorkspaceOptions,
} from './slack-workspace.js';
