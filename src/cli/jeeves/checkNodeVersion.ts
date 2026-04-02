/**
 * Runtime Node.js version floor check.
 *
 * @module
 */

/** Minimum supported Node.js major version. */
const MIN_NODE_MAJOR = 22;

/**
 * Check that the running Node.js version meets the minimum requirement.
 * Prints an error and exits with code 1 if the check fails.
 */
export function checkNodeVersion(): void {
  const major = parseInt(process.versions.node.split('.')[0], 10);
  if (major < MIN_NODE_MAJOR) {
    console.error(
      `Error: jeeves requires Node.js >= ${String(MIN_NODE_MAJOR)}. Current: ${process.versions.node}`,
    );
    process.exit(1);
  }
}
