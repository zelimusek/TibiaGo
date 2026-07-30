"use strict";

const assert = require("assert");

require("../require");

const BombermanEvent = requireModule("core/bomberman-event");
const Position = requireModule("utils/position");

let currentTime = 1000;
let effects = [];
let addedThings = [];
let deletedThings = [];
let occupiedPositions = new Set();
let players = new Map();

const positionKey = (position) => `${position.x}:${position.y}:${position.z}`;

const createTile = (position) => ({
  id: 1,
  position,
  isOccupied: () => false,
  isOccupiedCharacters: () => occupiedPositions.has(positionKey(position)),
  addTopThing(thing) {
    addedThings.push({ position, thing });
  },
  deleteThing(thing) {
    deletedThings.push({ position, thing });
  },
});

const originalProcessGameServer = process.gameServer;
const originalGlobalGameServer = global.gameServer;
global.gameServer = process.gameServer = {
  database: {
    createThing(id) {
      return { id };
    },
  },
  world: {
    getTileFromWorldPosition(position) {
      return createTile(position);
    },
    sendMagicEffect(position, effect) {
      effects.push({ position, effect });
    },
  },
};

const createPlayer = (name, position) => ({
  name,
  position,
  messages: [],
  getProperty(property) {
    return property === CONST.PROPERTIES.NAME ? this.name : null;
  },
  sendCancelMessage(message) {
    this.messages.push(message);
  },
});

const handler = {
  floorLava: {
    isRunning: () => false,
  },
  getConnectedPlayers() {
    return players;
  },
  teleportCreature(player, position, options) {
    assert.strictEqual(options.ignoreBomberman, true);
    player.position = position;
    return true;
  },
};

try {
  const alice = createPlayer("Alice", new Position(32509, 32340, 7));
  const bob = createPlayer("Bob", new Position(32521, 32352, 7));
  const spectator = createPlayer("Spectator", new Position(32507, 32342, 7));
  players.set(alice.name, alice);
  players.set(bob.name, bob);
  players.set(spectator.name, spectator);

  const event = new BombermanEvent(handler, {
    now: () => currentTime,
    random: () => 0.5,
  });

  assert.strictEqual(event.start().ok, true);
  assert.strictEqual(event.isRunning(), true);
  assert.strictEqual(event.__state.participants.size, 2);
  assert.strictEqual(event.__state.borderItems.size, 52);
  assert.strictEqual(event.__state.pillarItems.size, 36);
  assert.strictEqual(addedThings.filter((entry) => entry.thing.id === 1497).length, 88);
  assert.strictEqual(event.placeBomb(alice).ok, false);

  const blockedSpectator = event.handleDestination(
    spectator,
    new Position(32509, 32341, 7)
  );
  assert.ok(blockedSpectator);
  assert.strictEqual(blockedSpectator.position.x, 32507);

  currentTime += 5001;
  event.tick();
  assert.strictEqual(event.__state.phase, "active");

  const aliceBombPosition = alice.position.copy();
  assert.strictEqual(event.placeBomb(alice).ok, true);
  assert.strictEqual(event.placeBomb(alice).ok, false);
  assert.strictEqual(event.__state.bombs.size, 1);
  assert.ok(addedThings.some((entry) => entry.thing.id === 2247));

  bob.position = aliceBombPosition.addVector(1, 0, 0);
  currentTime += 3001;
  event.tick();

  assert.strictEqual(event.__state.bombs.size, 0);
  assert.strictEqual(event.__state.scores.get("Alice"), 1);
  assert.strictEqual(event.__state.deaths.get("Bob"), 1);
  assert.ok(effects.some((entry) => entry.effect === CONST.EFFECT.MAGIC.EXPLOSIONAREA));
  assert.match(bob.messages.at(-1), /Alice blew you up/i);

  assert.strictEqual(event.placeBomb(bob).ok, false);
  currentTime += 2001;
  assert.strictEqual(event.placeBomb(bob).ok, true);

  alice.position = bob.position.x < 32521
    ? bob.position.addVector(1, 0, 0)
    : bob.position.addVector(-1, 0, 0);
  assert.strictEqual(event.placeBomb(alice).ok, true);
  event.__state.bombs.get(positionKey(bob.position)).detonatesAt = currentTime;
  event.tick();
  assert.strictEqual(event.__state.bombs.size, 0);
  assert.ok(
    effects.filter((entry) => entry.effect === CONST.EFFECT.MAGIC.EXPLOSIONAREA).length > 2,
    "A chained pair of bombs should produce multiple explosion effects."
  );

  assert.strictEqual(event.stop().ok, true);
  assert.strictEqual(event.isRunning(), false);
  assert.ok(deletedThings.some((entry) => entry.thing.id === 2247));
  assert.strictEqual(deletedThings.filter((entry) => entry.thing.id === 1497).length, 88);

  console.log(
    "PASS: Bomberman builds the arena, places bombs, chains explosions and respawns scored hits."
  );
} finally {
  process.gameServer = originalProcessGameServer;
  global.gameServer = originalGlobalGameServer;
}
