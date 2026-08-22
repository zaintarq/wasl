const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo-metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = false;

config.resolver.resolverMainFields = ['react-native', 'browser', 'main', 'module'];

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  punycode: path.resolve(__dirname, 'node_modules/punycode/punycode.js'),
};

module.exports = config;
