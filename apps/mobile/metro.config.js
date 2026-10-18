/* oxlint-disable typescript/no-unsafe-call, typescript/no-unsafe-argument, typescript/no-unsafe-member-access, typescript/no-unnecessary-condition -- Metro loads this untyped CommonJS file */
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// The dev gallery renders every screen from fixture data; keep it out of production bundles.
if (process.env["NODE_ENV"] === "production") {
  config.resolver.blockList = [
    ...[config.resolver.blockList ?? []].flat(),
    /[\\/]app[\\/]gallery[\\/].*/,
    /[\\/]src[\\/]gallery[\\/].*/,
  ];
}

module.exports = config;
