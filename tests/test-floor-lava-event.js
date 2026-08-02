"use strict";

const assert = require("assert");

require("../require");

const FloorLavaEvent = requireModule("core/floor-lava-event");
const Position = requireModule("utils/position");

let currentTime = 1000;
let occupiedPositions = new Set();
let effects = [];
let createdThings = [];
let addedThings = [];
let deletedThings = [];
let players = new Map();
let spotlightTargets = [];

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
      const thing = { id };
      createdThings.push(thing);
      return thing;
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
    if (property === CONST.PROPERTIES.NAME) {
      return this.name;
    }
    return null;
  },
  sendCancelMessage(message) {
    this.messages.push(message);
  },
});

const handler = {
  getConnectedPlayers() {
    return players;
  },
  focusSpotlightsOnPlayer(player) {
    spotlightTargets.push(player.name);
  },
  teleportCreature(player, position, options) {
    assert.strictEqual(options.ignoreFloorLava, true);
    player.position = position;
    return true;
  },
};

try {
  const alice = createPlayer("Alice", new Position(32509, 32340, 7));
  const bob = createPlayer("Bob", new Position(32521, 32352, 7));
  const outsider = createPlayer("Outsider", new Position(32508, 32340, 7));
  players.set(alice.name, alice);
  players.set(bob.name, bob);
  players.set(outsider.name, outsider);

  const event = new FloorLavaEvent(handler, {
    now: () => currentTime,
    random: () => 0.5,
  });

  const started = event.start();
  assert.strictEqual(started.ok, true);
  assert.strictEqual(event.isRunning(), true);
  assert.strictEqual(event.__state.participants.size, 2);
  assert.strictEqual(event.__state.playableTiles.length, 169);
  assert.strictEqual(addedThings.length, 52);
  assert.ok(addedThings.every((entry) => entry.thing.id === 1498));
  assert.ok(addedThings.some((entry) => entry.position.x === 32508 && entry.position.y === 32340));
  assert.ok(addedThings.some((entry) => entry.position.x === 32522 && entry.position.y === 32352));
  assert.ok(addedThings.some((entry) => entry.position.x === 32509 && entry.position.y === 32339));
  assert.ok(addedThings.some((entry) => entry.position.x === 32521 && entry.position.y === 32353));
  assert.ok(!addedThings.some((entry) => entry.position.x === 32508 && entry.position.y === 32339));
  assert.ok(!addedThings.some((entry) => entry.position.x === 32522 && entry.position.y === 32339));
  assert.ok(!addedThings.some((entry) => entry.position.x === 32508 && entry.position.y === 32353));
  assert.ok(!addedThings.some((entry) => entry.position.x === 32522 && entry.position.y === 32353));
  assert.ok(effects.some((entry) => entry.effect === CONST.EFFECT.MAGIC.MAGIC_BLUE));

  const lateEntry = event.handleDestination(
    outsider,
    new Position(32509, 32345, 7)
  );
  assert.ok(lateEntry);
  assert.strictEqual(lateEntry.position.x, 32507);
  assert.ok(lateEntry.position.y >= 32340 && lateEntry.position.y <= 32346);

  occupiedPositions = new Set(
    Array.from({ length: 7 }, (_, offset) => `32507:${32340 + offset}:7`)
  );
  const overflowEntry = event.handleDestination(
    outsider,
    new Position(32510, 32345, 7)
  );
  assert.ok(overflowEntry);
  assert.strictEqual(overflowEntry.position.x, 32523);
  assert.ok(overflowEntry.position.y >= 32340 && overflowEntry.position.y <= 32346);
  occupiedPositions.clear();

  event.__state.phase = "active";
  event.__state.lava.add(positionKey(new Position(32510, 32340, 7)));
  const elimination = event.handleDestination(
    alice,
    new Position(32510, 32340, 7)
  );
  assert.ok(elimination);
  assert.strictEqual(elimination.eliminated, true);
  assert.strictEqual(event.__state.eliminated.has("Alice"), true);
  assert.strictEqual(elimination.position.x, 32507);

  const blockedReturn = event.handleDestination(
    alice,
    new Position(32509, 32341, 7)
  );
  assert.ok(blockedReturn);
  assert.strictEqual(blockedReturn.position.x, 32507);
  assert.match(alice.messages.at(-1), /wait for the next/i);
  assert.match(event.getStatus(), /1\/2 players still in/);

  assert.strictEqual(event.stop().ok, true);
  assert.strictEqual(event.isRunning(), false);
  assert.strictEqual(deletedThings.length, 52);
  assert.ok(deletedThings.every((entry) => entry.thing.id === 1498));

  effects = [];
  addedThings = [];
  deletedThings = [];

  players.clear();
  const carol = createPlayer("Carol", new Position(32509, 32340, 7));
  const dave = createPlayer("Dave", new Position(32521, 32352, 7));
  players.set(carol.name, carol);
  players.set(dave.name, dave);

  const waveEvent = new FloorLavaEvent(handler, {
    now: () => currentTime,
    random: () => 0.25,
  });
  assert.strictEqual(waveEvent.start().ok, true);

  currentTime += 10001;
  waveEvent.tick();
  assert.strictEqual(waveEvent.__state.phase, "active");
  assert.strictEqual(waveEvent.__state.wave, 1);
  assert.ok(waveEvent.__state.warned.size > 0);
  assert.ok(effects.some((entry) => entry.effect === CONST.EFFECT.MAGIC.SOUND_YELLOW));

  currentTime += 1500;
  waveEvent.tick();
  assert.ok(
    waveEvent.__state === null || waveEvent.__state.lava.size > 0,
    "The warned tiles should activate as lava."
  );

  players.clear();
  currentTime = 50000;
  for (let index = 0; index < 8; index++) {
    const x = 32509 + (index % 4);
    const y = 32340 + Math.floor(index / 4);
    const player = createPlayer(`Runner ${index + 1}`, new Position(x, y, 7));
    players.set(player.name, player);
  }
  const spotlightTargetsBeforeFullRound = spotlightTargets.length;

  const fullRound = new FloorLavaEvent(handler, {
    now: () => currentTime,
    random: () => 0.37,
  });
  assert.strictEqual(fullRound.start().ok, true);
  currentTime += 10001;
  fullRound.tick();

  let safetyCounter = 0;
  while (fullRound.isRunning() && safetyCounter < 40) {
    safetyCounter++;

    if (fullRound.__state.warned.size > 0) {
      const safePositions = fullRound.__state.playableTiles.filter((position) => {
        const key = positionKey(position);
        return !fullRound.__state.lava.has(key)
          && !fullRound.__state.warned.has(key);
      });
      const survivors = Array.from(fullRound.__state.participants)
        .filter((name) => !fullRound.__state.eliminated.has(name))
        .map((name) => players.get(name));

      survivors.forEach((player, index) => {
        if (safePositions[index]) {
          player.position = safePositions[index];
        }
      });

      currentTime += 1500;
      fullRound.tick();
    } else {
      currentTime += 1500;
      fullRound.tick();
    }
  }

  assert.strictEqual(fullRound.isRunning(), false);
  assert.ok(safetyCounter < 40, "A complete round should always resolve.");
  assert.strictEqual(
    spotlightTargets.length,
    spotlightTargetsBeforeFullRound + 1,
    "the Lava winner should receive the spotlight sequence"
  );

  console.log(
    "PASS: Floor is Lava locks participants, eliminates on lava and uses the overflow audience."
  );
} finally {
  process.gameServer = originalProcessGameServer;
  global.gameServer = originalGlobalGameServer;
}
