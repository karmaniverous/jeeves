/**
 * Managed section parsing, writing, and cleanup detection.
 *
 * @packageDocumentation
 */

export { jaccard, needsCleanup, shingles } from './cleanupDetection.js';
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
export {
  updateManagedSection,
  type UpdateManagedSectionOptions,
} from './updateManagedSection.js';
export {
  formatBeginMarker,
  formatEndMarker,
  shouldWrite,
} from './versionStamp.js';
