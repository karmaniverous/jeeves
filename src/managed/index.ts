/**
 * Managed section parsing, writing, and cleanup detection.
 *
 * @packageDocumentation
 */

export { jaccard, needsCleanup, shingles } from './cleanupDetection.js';
export {
  buildHeartbeatSection,
  type HeartbeatEntry,
  HEARTBEAT_HEADING,
  parseHeartbeat,
  type ParsedHeartbeat,
  writeHeartbeatSection,
} from './heartbeat.js';
export {
  atomicWrite,
  DEFAULT_CORE_VERSION,
  STALE_LOCK_MS,
  withFileLock,
} from './fileOps.js';
export {
  type ManagedSection,
  parseManaged,
  type ParseManagedResult,
  type VersionStamp,
} from './parseManaged.js';
export {
  removeManagedSection,
  type RemoveManagedSectionOptions,
} from './removeManagedSection.js';
export { sortSectionsByOrder } from './sectionSort.js';
export { stripForeignMarkers } from './stripForeignMarkers.js';
export {
  updateManagedSection,
  type UpdateManagedSectionOptions,
} from './updateManagedSection.js';
export {
  formatBeginMarker,
  formatEndMarker,
  shouldWrite,
} from './versionStamp.js';
