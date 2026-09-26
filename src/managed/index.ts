/**
 * Managed block parsing and pure rendering, plus atomic write and file lock.
 *
 * @packageDocumentation
 */

export { STALE_LOCK_MS, withFileLock } from './fileLock.js';
export { atomicWrite } from './fileOps.js';
export {
  formatBeginMarker,
  formatEndMarker,
  type ManagedBlockStampOptions,
  removeManagedBlock,
  renderManagedBlock,
  upsertManagedBlock,
} from './managedBlock.js';
export {
  parseManaged,
  type ParseManagedResult,
  type VersionStamp,
} from './parseManaged.js';
