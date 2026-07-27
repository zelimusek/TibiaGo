"use strict";

/*
 * Converts an RME items.otb plus its item XML files into TibiaGo's runtime
 * item definitions.  OTB contains the important server-ID -> client-ID map
 * and physical flags; XML supplements it with names and gameplay metadata.
 *
 * Example:
 *   node scripts/convert-rme-items.js --version 760 --source C:\RME\data\760
 */

const fs = require("fs");
const path = require("path");
const { parseStringPromise } = require("xml2js");
const otb2json = require("../tools/lib/otb2json");

const ROOT = path.resolve(__dirname, "..");
const NUMERIC_PROPERTIES = new Set([
  "attack", "armor", "charges", "containerSize", "defense", "duration",
  "healthGain", "healthTicks", "manaGain", "manaTicks", "maxTextLen",
  "speed", "transformDeEquipTo", "transformEquipTo", "weight",
  "writeOnceItemId"
]);
const BOOLEAN_PROPERTIES = new Set([
  "allowPickupable", "blockProjectile", "invisible", "magicPoints",
  "manaShield", "preventItemLoss", "readable", "showCharges",
  "showDuration", "stopDuration", "suppressDrunk", "writeable"
]);
const PROPERTY_ALIASES = {
  "allowpickupable": "allowPickupable",
  "blockprojectile": "blockProjectile",
  "containerSize": "containerSize",
  "containersize": "containerSize",
  "decayTo": "decayTo",
  "decayto": "decayTo",
  "def": "defense",
  "defence": "defense",
  "description": "description",
  "descr": "description",
  "maxitems": "containerSize",
  "position": "slotType",
  "slot": "slotType",
  "skill": "weaponType",
  "type": "type",
  "weaponType": "weaponType",
  "weapontype": "weaponType"
};

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function normaliseKey(key) {
  return PROPERTY_ALIASES[key] || key;
}

function normaliseValue(key, value, xmlAttribute = false) {
  if (value === undefined || value === "") return undefined;
  // RME's items2.xml stores weight in oz (18.0), while the optional
  // items.xml overrides use TibiaGo's centi-ounce unit already (1800).
  if (key === "weight") return xmlAttribute ? Number(value) : Math.round(Number(value) * 100);
  if (NUMERIC_PROPERTIES.has(key)) return Number(value);
  if (BOOLEAN_PROPERTIES.has(key)) return String(value) === "1" || String(value).toLowerCase() === "true";
  return value;
}

function applyProperty(properties, rawKey, rawValue, xmlAttribute = false) {
  const key = normaliseKey(rawKey);
  if (["id", "fromid", "toid", "editorsuffix"].includes(rawKey)) return;
  const value = normaliseValue(key, rawValue, xmlAttribute);
  if (value !== undefined && !Number.isNaN(value)) properties[key] = value;
}

function inferType(entry) {
  if (entry.properties.type) return;
  switch (entry.group) {
    case 0x02: entry.properties.type = "container"; break;
    case 0x06: entry.properties.type = "rune"; break;
    case 0x0B: entry.properties.type = "splash"; break;
    case 0x0C: entry.properties.type = "fluidContainer"; break;
  }

  if (entry.group === 0x06) entry.properties.stackable = true;
}

async function loadXml(sourceDirectory, filename, entries) {
  const file = path.join(sourceDirectory, filename);
  if (!fs.existsSync(file)) return 0;

  const document = await parseStringPromise(fs.readFileSync(file, "utf8"));
  const items = document.items && document.items.item ? document.items.item : [];
  let applied = 0;

  for (const item of items) {
    const attributes = item.$ || {};
    const from = Number(attributes.fromid || attributes.id);
    const to = Number(attributes.toid || attributes.id);
    if (!Number.isInteger(from) || !Number.isInteger(to)) continue;

    for (let serverId = from; serverId <= to; serverId++) {
      const entry = entries[serverId];
      if (!entry) continue;

      for (const [key, value] of Object.entries(attributes)) applyProperty(entry.properties, key, value);
      for (const child of item.attribute || []) {
        const attribute = child.$ || {};
        applyProperty(entry.properties, attribute.key, attribute.value, true);
      }
      applied++;
    }
  }

  return applied;
}

async function main() {
  const version = readOption("--version");
  const source = readOption("--source");
  const output = readOption("--output") || (version && path.join(ROOT, "data", version, "items", "definitions.json"));

  if (!version || !source || !output) {
    throw new Error("Usage: node scripts/convert-rme-items.js --version <version> --source <RME datapack directory> [--output <file>]");
  }

  const sourceDirectory = path.resolve(source);
  const otbPath = path.join(sourceDirectory, "items.otb");
  if (!fs.existsSync(otbPath)) throw new Error(`Missing ${otbPath}`);

  const otb = otb2json.read(otbPath);
  const entries = {};
  for (const node of otb.children || []) {
    if (!Number.isInteger(node.sid) || !Number.isInteger(node.cid)) continue;
    entries[node.sid] = {
      id: node.cid,
      flags: node.flags,
      group: node.group,
      properties: {}
    };
  }

  const items2Applied = await loadXml(sourceDirectory, "items2.xml", entries);
  const itemsApplied = await loadXml(sourceDirectory, "items.xml", entries);
  for (const entry of Object.values(entries)) inferType(entry);

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(entries, null, 2)}\n`);

  const named = Object.values(entries).filter(entry => entry.properties.name).length;
  console.log(`Converted ${Object.keys(entries).length} OTB items for ${version}.`);
  console.log(`Applied ${items2Applied} entries from items2.xml and ${itemsApplied} from items.xml.`);
  console.log(`${named} items have a name. Output: ${output}`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
