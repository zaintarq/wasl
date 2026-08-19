const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo-metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Firebase + Expo: disable package.json "exports" resolution (we rely on mainFields).
// This avoids Metro picking Node/Web export conditions that are incompatible with native.
config.resolver.unstable_enablePackageExports = false;

// TensorFlow / NSFWJS model weight files
config.resolver.assetExts = [...config.resolver.assetExts, 'bin'];

// CRITICAL: ensure @firebase/app does NOT resolve to its CJS "main" entry,
// because that entry registers the "node" variant (`registerCoreComponents('node')`).
// Using browser entries keeps it in the correct client runtime and fixes:
// - "Component auth has not been registered yet"
// - "Service firestore is not available"
//
// Also: prefer "main" over "module" to avoid pulling ESM-only builds for packages
// that are required as CJS at runtime (e.g. `punycode` used by `whatwg-url`).
config.resolver.resolverMainFields = ['react-native', 'browser', 'main', 'module'];

// Hard alias: `whatwg-url` does `require("punycode")` and expects `punycode.ucs2.decode`.
// The ESM build (`punycode.es6.js`) does NOT provide that shape, so we force the CJS file.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  punycode: path.resolve(__dirname, 'node_modules/punycode/punycode.js'),
};

module.exports = config;
