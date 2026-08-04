"use strict";

const assert = require("assert");
require("../require");

const LaserChairsEvent = requireModule("core/laser-chairs-event");
const Position = requireModule("utils/position");

let currentTime = 1000;
let players = new Map();
let teleports = [];
let celebrations = [];
let yells = [];
let ambienceSyncs = 0;

const originalProcessGameServer = process.gameServer;
const originalGlobalGameServer = global.gameServer;
global.gameServer = process.gameServer = {
  world: {
    getTileFromWorldPosition(position) {
      return {
        id: 1,
        position,
        isOccupied: () => false,
        isOccupiedCharacters: () => false
      };
    },
    sendMagicEffect() {}
  }
};

function createPlayer(name, x, y) {
  return {
    name,
    position: new Position(x, y, 7),
    messages: [],
    getProperty(property) {
      return property === CONST.PROPERTIES.NAME ? this.name : null;
    },
    sendCancelMessage(message) { this.messages.push(message); }
  };
}

const handler = {
  floorLava: { isRunning: () => false },
  bomberman: { isRunning: () => false },
  getConnectedPlayers() { return players; },
  isInsidePartyRadioZone() { return true; },
  __resyncRadioAmbience() { ambienceSyncs++; },
  teleportCreature(player, position, options) {
    assert.deepStrictEqual(options, { ignoreLaserChairs: true });
    teleports.push({ player: player.name, position });
    player.position = position;
    return true;
  },
  celebratePartyWinner(player) { celebrations.push(player.name); },
  announceNpcYell(npc, message) { yells.push({ npc, message }); }
};

try {
  const alice = createPlayer("Alice", 32509, 32340);
  const bob = createPlayer("Bob", 32510, 32340);
  const charlie = createPlayer("Charlie", 32511, 32340);
  const outsider = createPlayer("Outsider", 32508, 32340);
  [alice, bob, charlie, outsider].forEach((player) => players.set(player.name, player));

  const event = new LaserChairsEvent(handler, {
    now: () => currentTime,
    random: () => 0.5
  });
  assert.strictEqual(event.start().ok, true);
  assert.strictEqual(event.__state.participants.size, 3);
  assert.strictEqual(event.getPayload().phase, "countdown");
  assert.ok(ambienceSyncs > 0, "starting must synchronize the laser border");

  const blockedExit = event.handleDestination(alice, new Position(32508, 32340, 7));
  assert.deepStrictEqual(blockedExit, { position: null });
  const blockedEntry = event.handleDestination(outsider, new Position(32512, 32340, 7));
  assert.ok(blockedEntry && blockedEntry.position.x === 32507);

  currentTime += 5000;
  event.tick();
  assert.strictEqual(event.__state.phase, "dancing");

  currentTime += 6000;
  event.tick();
  assert.strictEqual(event.__state.phase, "claiming");
  assert.strictEqual(event.__state.squares.size, 2);
  assert.ok(alice.messages.includes("Find your square!"));

  const firstSquares = Array.from(event.__state.squares.values());
  alice.position = firstSquares[0];
  bob.position = firstSquares[1];
  charlie.position = new Position(32515, 32346, 7);
  event.tick();
  assert.strictEqual(event.__state.phase, "result", "all occupied squares must end the seven-second window immediately");
  assert.strictEqual(event.__state.eliminated.has("Charlie"), true);
  assert.strictEqual(teleports.at(-1).player, "Charlie");
  assert.ok(alice.messages.includes("2 players remain!"));

  currentTime += 1500;
  event.tick();
  assert.strictEqual(event.__state.phase, "dancing");
  currentTime += 6000;
  event.tick();
  assert.strictEqual(event.__state.phase, "claiming");
  assert.strictEqual(event.__state.squares.size, 1);

  alice.position = Array.from(event.__state.squares.values())[0];
  bob.position = new Position(32514, 32346, 7);
  event.tick();
  assert.strictEqual(event.isRunning(), false);
  assert.deepStrictEqual(celebrations, ["Alice"]);
  assert.ok(yells.some((entry) => entry.npc === "DJ Thomas" && /Alice wins Laser Chairs/.test(entry.message)));

  players.clear();
  const dora = createPlayer("Dora", 32509, 32340);
  const eric = createPlayer("Eric", 32510, 32340);
  players.set(dora.name, dora);
  players.set(eric.name, eric);
  const repeat = new LaserChairsEvent(handler, { now: () => currentTime, random: () => 0.5 });
  assert.strictEqual(repeat.start().ok, true);
  currentTime += 5000;
  repeat.tick();
  currentTime += 6000;
  repeat.tick();
  currentTime += 7000;
  repeat.tick();
  assert.strictEqual(repeat.__state.phase, "result");
  assert.strictEqual(repeat.__getSurvivorNames().length, 2, "a zero-claim round must repeat without eliminating everybody");
  const repeatedRoundNumber = repeat.__state.round;
  currentTime += 1500;
  repeat.tick();
  currentTime += 6000;
  repeat.tick();
  assert.strictEqual(repeat.__state.round, repeatedRoundNumber, "an empty attempt must repeat the same numbered round");

  console.log("PASS: Laser Chairs draws N-1 squares, resolves early, repeats empty rounds and celebrates the winner.");
} finally {
  process.gameServer = originalProcessGameServer;
  global.gameServer = originalGlobalGameServer;
}
