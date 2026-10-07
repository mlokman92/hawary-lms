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

// 3. One React. The web app and this one pin different patch versions, so the
//    workspace holds two copies: the root one (web's) and apps/mobile's own.
//    Hoisted packages — react-native itself, expo-router, TanStack Query —
//    would otherwise resolve the root copy while the app's own code resolves
//    the local one, and two Reacts in a bundle means hooks throw. Every `react`
//    import is therefore resolved as if it came from this folder.
const reactOrigin = path.resolve(projectRoot, 'package.json');
const SINGLETONS = /^(react|react-dom)(\/.*)?$/;

const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstreamResolveRequest ?? context.resolveRequest;
  if (SINGLETONS.test(moduleName)) {
    return resolve({ ...context, originModulePath: reactOrigin }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
