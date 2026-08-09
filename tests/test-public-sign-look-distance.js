"use strict";

const assert = require("assert");

require("../require");

const PacketHandler = requireModule("network/packet-handler");
const Position = requireModule("utils/position");

const handler = Object.create(PacketHandler.prototype);

function publicItem(name, x, y, z) {
  return {
    getName: () => name,
    getPosition: () => new Position(x, y, z)
  };
}

const player = { position: new Position(100, 100, 7) };

assert.strictEqual(
  handler.__canReadPublicItemFromDistance(player, publicItem("street sign", 108, 108, 7)),
  true,
  "a street sign should be readable from eight SQM, including diagonally"
);
assert.strictEqual(
  handler.__canReadPublicItemFromDistance(player, publicItem("blackboard", 92, 100, 7)),
  true,
  "a blackboard should be readable from eight SQM"
);
assert.strictEqual(
  handler.__canReadPublicItemFromDistance(player, publicItem("sign", 109, 100, 7)),
  false,
  "a public sign should not be readable beyond eight SQM"
);
assert.strictEqual(
  handler.__canReadPublicItemFromDistance(player, publicItem("street sign", 100, 100, 6)),
  false,
  "a public sign should not be readable from another floor"
);
assert.strictEqual(
  handler.__canReadPublicItemFromDistance(player, publicItem("letter", 101, 100, 7)),
  false,
  "private readable items must not inherit the public sign range"
);

console.log("Public sign look-distance tests passed.");
