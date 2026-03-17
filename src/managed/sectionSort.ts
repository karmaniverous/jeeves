/**
 * Stable section ordering for managed TOOLS.md blocks.
 *
 * @remarks
 * Sorts sections by the canonical SECTION_ORDER: known sections
 * appear in their defined order, unknown sections are appended after.
 * Used by both parseManaged (for consistent output) and
 * updateManagedSection (for reassembly).
 */

import { SECTION_ORDER } from '../constants/sections.js';
import type { ManagedSection } from './parseManaged.js';

/**
 * Sort sections in place by stable ordering.
 *
 * @param sections - Array of managed sections to sort.
 * @returns The sorted array (same reference, mutated in place).
 */
export function sortSectionsByOrder(
  sections: ManagedSection[],
): ManagedSection[] {
  return sections.sort((a, b) => {
    const aIdx = SECTION_ORDER.indexOf(a.id);
    const bIdx = SECTION_ORDER.indexOf(b.id);
    const aOrder = aIdx === -1 ? SECTION_ORDER.length : aIdx;
    const bOrder = bIdx === -1 ? SECTION_ORDER.length : bIdx;
    return aOrder - bOrder;
  });
}
