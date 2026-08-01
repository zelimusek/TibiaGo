"use strict";

const assert = require("assert");

require("../require");

const CreatureHandler = requireModule("core/world-creature-handler");
const { ItemInformationPacket } = requireModule("network/protocol");
const Position = requireModule("utils/position");

const handler = Object.create(CreatureHandler.prototype);
handler.__radioZones = [
  {
    id: "party-radio",
    enabled: true,
    fadeMetric: "chebyshev",
    center: { x: 32515, y: 32346, z: 7 },
    radius: 6,
    from: { x: 32509, y: 32340, z: 7 },
    to: { x: 32521, y: 32352, z: 7 }
  },
  {
    id: "unrelated-radio",
    enabled: true,
    from: { x: 100, y: 100, z: 7 },
    to: { x: 110, y: 110, z: 7 }
  }
];
handler.__playerMap = new Map([
  ["center", { position: new Position(32515, 32346, 7) }],
  ["edge", { position: new Position(32521, 32352, 7) }],
  ["fade", { position: new Position(32522, 32352, 7) }],
  ["other radio", { position: new Position(105, 105, 7) }],
  ["other floor", { position: new Position(32515, 32346, 6) }]
]);

function readableAt(x, y, z, content = "map text") {
  return {
    getContent: () => content,
    getPosition: () => new Position(x, y, z)
  };
}

assert.strictEqual(
  handler.getPartyRadioPlayerCount(),
  2,
  "only players inside the party /radio core should be counted"
);

assert.strictEqual(
  handler.getReadableContent(readableAt(32517, 32391, 7)),
  "       Welcome to:\n"
    + "CYRK'S PARTY ZONE!\n"
    + "Currently we have 5 players online\n"
    + "and 2 of them in the dance hall!"
);

assert.strictEqual(
  handler.getReadableContent(readableAt(32517, 32357, 7)),
  "The party is on!\n"
    + "2 players are already inside.\n"
    + "Join them and hit the dance floor!"
);

assert.strictEqual(
  handler.getReadableContent(readableAt(32513, 32357, 7)),
  "Join the party!\n"
    + "Two amazing DJs, awesome beats, fun games and 2 players on the dance floor!"
);

assert.strictEqual(
  handler.getReadableContent(readableAt(1, 2, 3)),
  "map text",
  "ordinary readable items must keep their map content"
);

const originalGlobalGameServer = global.gameServer;
const originalProcessGameServer = process.gameServer;
global.gameServer = process.gameServer = {
  database: {
    getClientId: id => id
  }
};

try {
  const signText = handler.getReadableContent({
    getPosition: () => new Position(32517, 32391, 7)
  });
  const signPacket = new ItemInformationPacket({
    id: 1438,
    count: 0,
    isDistanceReadable: () => false,
    getArticle: () => "a",
    getName: () => "street sign",
    getDescription: () => null,
    isPickupable: () => false
  }, true, null, signText);

  const encodedTextLength = signPacket.buffer.readUInt16LE(9);
  const encodedText = signPacket.buffer.toString("utf8", 11, 11 + encodedTextLength);
  assert.strictEqual(
    encodedText,
    signText.escapeHTML(),
    "a dynamic street sign must carry text even without the distance-readable item flag"
  );
} finally {
  global.gameServer = originalGlobalGameServer;
  process.gameServer = originalProcessGameServer;
}

console.log("Party noticeboard tests passed.");
