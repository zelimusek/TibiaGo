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
  addedConditions: [],
  removedConditions: [],
  getProperty(property) {
    return property === CONST.PROPERTIES.NAME ? this.name : null;
  },
  sendCancelMessage(message) {
    this.messages.push(message);
  },
  addCondition(id, ticks, duration, properties) {
    this.addedConditions.push({ id, ticks, duration, properties });
  },
  removeCondition(id) {
    this.removedConditions.push(id);
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

const addPowerUp = (event, player, type, position) => {
  event.__state.powerUps.set(positionKey(position), { type, position });
  event.handleDestination(player, position);
  player.position = position;
};

try {
  const alice = createPlayer("Alice", new Position(32509, 32340, 7));
  const bob = createPlayer("Bob", new Position(32521, 32352, 7));
  const spectator = createPlayer("Spectator", new Position(32507, 32342, 7));
  players.set(alice.name, alice);
  players.set(bob.name, bob);
  players.set(spectator.name, spectator);

  // A deterministic 0.5 roll makes destroyed crates drop the +bomb power-up.
  const event = new BombermanEvent(handler, {
    now: () => currentTime,
    random: () => 0.5,
  });

  assert.strictEqual(event.start("mayhem").ok, true);
  assert.strictEqual(event.isRunning(), true);
  assert.strictEqual(event.__state.mode, "mayhem");
  assert.strictEqual(event.__state.participants.size, 2);
  assert.strictEqual(event.__state.borderItems.size, 52);
  assert.strictEqual(event.__state.crateItems.size, 36);
  assert.strictEqual(addedThings.filter((entry) => entry.thing.id === 1497).length, 52);
  assert.strictEqual(addedThings.filter((entry) => entry.thing.id === 1739).length, 36);
  assert.ok(
    addedThings
      .filter((entry) => entry.thing.id === 1739)
      .every((entry) => entry.thing.isBlockSolid() && !entry.thing.isMoveable())
  );
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

  // Blow up the first destructible crate and collect its deterministic drop.
  const cratePosition = new Position(32510, 32341, 7);
  alice.position = new Position(32509, 32341, 7);
  bob.position = new Position(32521, 32352, 7);
  assert.strictEqual(event.placeBomb(alice).ok, true);
  currentTime += 3001;
  event.tick();
  assert.strictEqual(event.__state.crateItems.size, 35);
  assert.strictEqual(event.__state.powerUps.get(positionKey(cratePosition)).type, "bomb");
  event.handleDestination(alice, cratePosition);
  alice.position = cratePosition;
  assert.strictEqual(event.__state.maximumBombsByPlayer.get("Alice"), 2);

  // Verify the remaining three bonuses.
  const rangePosition = new Position(32511, 32340, 7);
  addPowerUp(event, alice, "range", rangePosition);
  assert.strictEqual(event.__state.blastRangeByPlayer.get("Alice"), 3);

  const speedPosition = new Position(32512, 32340, 7);
  addPowerUp(event, alice, "speed", speedPosition);
  assert.strictEqual(alice.addedConditions.length, 1);
  assert.strictEqual(alice.addedConditions[0].ticks, 20);
  assert.strictEqual(alice.addedConditions[0].duration, 500);

  const shieldPosition = new Position(32520, 32352, 7);
  addPowerUp(event, bob, "shield", shieldPosition);
  assert.strictEqual(event.__state.shields.get("Bob"), 1);

  // The shield absorbs one explosion without a death or score.
  currentTime += 2001;
  alice.position = new Position(32515, 32340, 7);
  bob.position = new Position(32516, 32340, 7);
  assert.strictEqual(event.placeBomb(alice).ok, true);
  currentTime += 3001;
  event.tick();
  assert.strictEqual(event.__state.shields.get("Bob"), 0);
  assert.strictEqual(event.__state.deaths.get("Bob"), 0);
  assert.strictEqual(event.__state.scores.get("Alice"), 0);
  assert.match(bob.messages.at(-1), /shield absorbed/i);

  // The next explosion scores normally and respawns Bob.
  currentTime += 2001;
  alice.position = new Position(32515, 32340, 7);
  bob.position = new Position(32516, 32340, 7);
  assert.strictEqual(event.placeBomb(alice).ok, true);
  currentTime += 3001;
  event.tick();
  assert.strictEqual(event.__state.scores.get("Alice"), 1);
  assert.strictEqual(event.__state.deaths.get("Bob"), 1);
  assert.match(bob.messages.at(-1), /Alice blew you up/i);

  // The +bomb bonus permits two simultaneous bombs and preserves chaining.
  currentTime += 2001;
  alice.position = new Position(32512, 32340, 7);
  assert.strictEqual(event.placeBomb(alice).ok, true);
  alice.position = new Position(32514, 32340, 7);
  assert.strictEqual(event.placeBomb(alice).ok, true);
  event.__state.bombs.get(positionKey(new Position(32512, 32340, 7))).detonatesAt = currentTime;
  event.tick();
  assert.strictEqual(event.__state.bombs.size, 0);
  assert.ok(
    effects.filter((entry) => entry.effect === CONST.EFFECT.MAGIC.EXPLOSIONAREA).length > 4,
    "A chained pair of bombs should produce multiple explosion effects."
  );

  assert.strictEqual(event.stop().ok, true);
  assert.strictEqual(event.isRunning(), false);
  assert.ok(alice.removedConditions.length > 0);
  assert.strictEqual(deletedThings.filter((entry) => entry.thing.id === 1497).length, 52);
  assert.strictEqual(deletedThings.filter((entry) => entry.thing.id === 1739).length, 36);

  // Elimination has no respawn: one protected survivor wins immediately.
  currentTime = 200000;
  addedThings = [];
  deletedThings = [];
  alice.position = new Position(32509, 32340, 7);
  bob.position = new Position(32521, 32352, 7);

  const elimination = new BombermanEvent(handler, {
    now: () => currentTime,
    random: () => 0.99,
  });
  assert.strictEqual(elimination.start("elimination").ok, true);
  currentTime += 5001;
  elimination.tick();
  elimination.__state.shields.set("Alice", 1);
  alice.position = new Position(32515, 32340, 7);
  bob.position = new Position(32516, 32340, 7);
  assert.strictEqual(elimination.placeBomb(alice).ok, true);
  currentTime += 3001;
  elimination.tick();
  assert.strictEqual(elimination.isRunning(), false);
  assert.strictEqual(bob.position.x, 32507);
  assert.ok(alice.messages.some((message) => /Alice wins Bomberman elimination/i.test(message)));

  console.log(
    "PASS: Bomberman supports mayhem, elimination, destructible crates and all four power-ups."
  );
} finally {
  process.gameServer = originalProcessGameServer;
  global.gameServer = originalGlobalGameServer;
}
