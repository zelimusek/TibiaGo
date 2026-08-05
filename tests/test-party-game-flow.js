"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
require("../require");

const PartyGameFlow = requireModule("core/party-game-flow");
const Position = requireModule("utils/position");

let now = 1000;
let players = new Map();
let syncs = 0;
let yells = [];
let focused = [];
let running = { lava: false, bomber: false, chairs: false };

function player(id, name, x, y) {
  return {
    id,
    name,
    position: new Position(x, y, 7),
    insideRadio: true,
    messages: [],
    packets: [],
    getId() { return this.id; },
    getProperty(property) { return property === CONST.PROPERTIES.NAME ? this.name : null; },
    sendCancelMessage(message) { this.messages.push(message); },
    write(packet) { this.packets.push(packet); }
  };
}

const handler = {
  getConnectedPlayers() { return players; },
  isInsidePartyRadioZone(position) {
    let match = Array.from(players.values()).find(function (entry) { return entry.position === position; });
    return Boolean(match && match.insideRadio);
  },
  __resyncRadioAmbience() { syncs++; },
  announceNpcYell(npc, message) { yells.push({ npc, message }); },
  focusSpotlightsOnPlayer(target, options) { focused.push({ target: target.name, options }); return { ok: true }; },
  floorLava: {
    isRunning() { return running.lava; },
    start() { running.lava = true; return { ok: true }; }
  },
  bomberman: {
    isRunning() { return running.bomber; },
    start() { running.bomber = true; return { ok: true }; }
  },
  laserChairs: {
    isRunning() { return running.chairs; },
    start() { running.chairs = true; return { ok: true }; }
  }
};

const alice = player(1, "Alice", 32509, 32340);
const bob = player(2, "Bob", 32510, 32340);
players.set(alice.id, alice);
players.set(bob.id, bob);

const flow = new PartyGameFlow(handler, { now: () => now, random: () => 0 });
flow.tick();
assert.strictEqual(flow.__state.phase, "lobby");
assert.strictEqual(flow.__state.endsAt - flow.__state.startedAt, 45000, "two online players get a 45-second lobby");

for (let id = 3; id <= 7; id++) {
  let entry = player(id, "Player " + id, 32508 + id, 32341);
  players.set(id, entry);
}
flow.tick();
assert.strictEqual(flow.__state.maximumDurationMs, 75000, "seven online players raise the hard cap to 75 seconds");
assert.strictEqual(flow.__state.endsAt - flow.__state.startedAt, 75000,
  "five simultaneous entrances may add only the single online-count allowance, never 150 seconds");
assert.strictEqual(flow.getPayload().lastBonus.addedSeconds, 30);

now += 75000;
flow.tick();
assert.strictEqual(flow.__state.phase, "roulette");
assert.strictEqual(flow.getPayload().candidates.length, 7);
let winnerId = flow.__state.winnerId;
let winner = players.get(winnerId);

let late = player(20, "Late", 32508, 32346);
players.set(late.id, late);
assert.deepStrictEqual(flow.handleDestination(late, new Position(32515, 32346, 7)), { position: null },
  "outsiders cannot enter a roulette already in progress");
assert.deepStrictEqual(flow.handleDestination(winner, new Position(32508, 32346, 7)), { position: null },
  "roulette candidates cannot leave the sealed floor");

now += 10000;
flow.tick();
assert.strictEqual(flow.__state.phase, "choice-pending");
assert.strictEqual(focused.at(-1).target, winner.name);
assert.ok(yells.some(function (entry) { return /Laser Roulette has chosen/.test(entry.message); }));

now += 8000;
flow.tick();
assert.strictEqual(flow.__state.phase, "choice");
assert.ok(winner.packets.length > 0, "only the selected player receives the choice modal packet");
assert.strictEqual(flow.handleChoice(late, "lava"), false, "another player cannot spoof the winner's choice");
assert.strictEqual(flow.handleChoice(winner, "lava"), true);
assert.strictEqual(flow.__state.phase, "game");
assert.strictEqual(running.lava, true);

running.lava = false;
flow.handleGameWinner(winner, "lava");
assert.strictEqual(flow.__state.phase, "choice-pending");
now += 11200;
flow.tick();
assert.strictEqual(flow.__state.phase, "choice");

Array.from(players.values()).forEach(function (entry) {
  if (entry !== winner) entry.position = new Position(32507, 32340, 7);
});
assert.strictEqual(flow.handleChoice(winner, "chairs"), true);
assert.strictEqual(flow.__state.phase, "waiting-game", "a chosen game waits while only the winner remains on the floor");
(winner === alice ? bob : alice).position = new Position(32510, 32340, 7);
flow.tick();
assert.strictEqual(flow.__state.phase, "game");
assert.strictEqual(running.chairs, true);
assert.ok(syncs > 0);

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "client", "index.html"), "utf8");
const launcher = fs.readFileSync(path.join(root, "client", "src", "launcher.js"), "utf8");
const packetHandler = fs.readFileSync(path.join(root, "client", "src", "network", "packet-handler.js"), "utf8");
const weather = fs.readFileSync(path.join(root, "client", "src", "rendering", "weather-canvas.js"), "utf8");
assert.ok(html.includes('id="party-choice-modal"'));
assert.ok(html.includes("Choose a Minigame"));
assert.ok(html.includes("Leave It to Chance"));
assert.ok(launcher.includes("modal-party-choice.js"));
assert.ok(packetHandler.includes('let partyChoicePrefix = "party-choice:"'));
assert.ok(weather.includes("__getPartyFlowFrame"));

console.log("PASS: capped party lobby, Laser Roulette, protected winner choice and responsive game queue work together.");
