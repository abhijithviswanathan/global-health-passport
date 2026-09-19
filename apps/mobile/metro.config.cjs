/**
 * Expo Metro configuration for resolving the sibling apps/shared modules.
 * Shared workflow edits must remain importable from both native and web bundlers.
 */
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Both clients use this pure date/agenda model; include it in native bundles.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../shared')];
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  /[/\\]tests[/\\]browser[/\\].*/,
];
module.exports = config;
