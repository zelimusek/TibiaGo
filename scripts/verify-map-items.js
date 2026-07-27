"use strict";

/*
 * Validates every ground and item server ID used by an OTBM map against a
 * TibiaGo definitions.json file. It deliberately does not start the server,
 * so it is safe to run before deploying a new datapack.
 *
 * Example:
 *   node scripts/verify-map-items.js --map data/740/world/Tibia74.otbm --definitions data/760/items/definitions.json
 */

const fs = require("fs");
const path = require("path");

require("../require");

const OTBMParser = requireModule("parsers/otbm-parser");
const HEADERS = requireModule("parsers/otbm-headers");

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function describePosition(node) {
  const position = node.getPosition();
  return position ? `${position.x}, ${position.y}, ${position.z}` : "unknown position";
}

function main() {
  const mapArgument = option("--map");
  const definitionsArgument = option("--definitions");
  if (!mapArgument || !definitionsArgument) {
    throw new Error("Usage: node scripts/verify-map-items.js --map <map.otbm> --definitions <definitions.json>");
  }

  const mapFile = path.resolve(mapArgument);
  const definitionsFile = path.resolve(definitionsArgument);
  const definitions = JSON.parse(fs.readFileSync(definitionsFile, "utf8"));
  const missing = new Map();
  let checked = 0;

  const parser = new OTBMParser();
  parser.emitNode = (node) => {
    const itemIds = [];
    if (node.type === HEADERS.OTBM_ITEM) itemIds.push(node.properties.id);
    if (node.type === HEADERS.OTBM_TILE || node.type === HEADERS.OTBM_HOUSETILE) {
      const groundId = node.getAttribute(HEADERS.OTBM_ATTR_ITEM);
      if (groundId) itemIds.push(groundId);
    }

    for (const itemId of itemIds) {
      checked++;
      if (definitions[itemId]) continue;
      if (!missing.has(itemId)) missing.set(itemId, []);
      const locations = missing.get(itemId);
      if (locations.length < 5) locations.push(describePosition(node));
    }
  };

  parser.read(mapFile);

  console.log(`Checked ${checked} map ground/item references against ${path.basename(definitionsFile)}.`);
  if (missing.size === 0) {
    console.log("PASS: every map item has a converted definition.");
    return;
  }

  console.log(`FAIL: ${missing.size} server IDs are missing definitions.`);
  for (const [itemId, locations] of [...missing.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${itemId}: ${locations.join("; ")}`);
  }
  process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
