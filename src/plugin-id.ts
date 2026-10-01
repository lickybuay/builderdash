/**
 * Plugin identity constants.
 *
 * Kept in their own module so the admin entrypoint does not import the server
 * entrypoint (which pulls in `emdash` and would drag the runtime into the
 * browser bundle).
 */

export const PLUGIN_ID = "builderdash";
export const PLUGIN_VERSION = "0.1.0";
