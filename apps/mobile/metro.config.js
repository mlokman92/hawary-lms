// Metro config for Expo inside the pnpm monorepo.
// Without this, Metro can't resolve @hawary/shared (a "workspace:*" package) or
// watch changes in packages/*. See https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole monorepo so edits in packages/* trigger reloads.
config.watchFolders = [monorepoRoot];

// 2. Resolve modules from the app first, then the hoisted workspace root
//    (.npmrc sets node-linker=hoisted, so most deps live at the root).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;
