const fs = require("fs");
const path = require("path");

global.CONFIG = require("./config");

// Allows an isolated local datapack check without changing config.json or the
// production default. Example: TIBIAGO_CLIENT_VERSION=760 node server-production.js
if (process.env.TIBIAGO_CLIENT_VERSION) {
  CONFIG.SERVER.CLIENT_VERSION = process.env.TIBIAGO_CLIENT_VERSION;
}

// Create some useful global functions
global.getDataFile = function () {

  /*
   * Function global.getDataFile
   * Returns a file from the base data directory
   */

  let versionPath = path.join(__dirname, "data", CONFIG.SERVER.CLIENT_VERSION, ...arguments);
  if (fs.existsSync(versionPath) || CONFIG.SERVER.CLIENT_VERSION === "740") {
    return versionPath;
  }

  // New asset versions share the same game scripts, monsters and map logic
  // until a version-specific file is explicitly supplied (such as 760 items).
  return path.join(__dirname, "data", "740", ...arguments);

}

global.requireData = function () {

  /*
   * Function global.requireData
   * Requires a module from the base data directory
   */

  return require(getDataFile(...arguments))

}

global.requireModule = function () {

  /*
   * Function global.requireModule
   * Requires a module from the base source directory
   */

  return require(path.join(__dirname, "src", ...arguments));

}

// Requires the prototype modifications
requireModule("utils/__proto__");

// Load constants
global.CONST = require("./" + path.join("client", "data", CONFIG.SERVER.CLIENT_VERSION, "constants.json"))

// Check the NodeJS version
let [major, minor, patch] = process.versions.node.split(".");

// Confirm major NodeJS version
if (major < 16) {
  console.log("Could not launch gameserver: required version > 16.0.0 and current version: %s.".format(process.versions.node));
  return process.exit(1);
}
