"use strict";

const assert = require("assert");

require("../require");

const PartyBouncerEvent = requireModule("core/party-bouncer-event");
const IPCountry = requireModule("utils/ip-country");
const Position = requireModule("utils/position");
const CommandHandler = requireModule("utils/command-handler");

let now = 1000;
let spoken = [];
let faced = [];

const makeNPC = function (name) {
  return {
    name,
    direction: CONST.DIRECTION.SOUTH,
    isPlayer: () => false,
    getProperty(property) {
      return property === CONST.PROPERTIES.NAME ? name : this.direction;
    },
    setDirection(direction) {
      this.direction = direction;
    },
    faceCreature(player) {
      faced.push({ name, player });
    },
    speechHandler: {
      privateSay(player, message) {
        spoken.push({ name, player, message });
      }
    }
  };
};

const makePlayer = function (countryCode, mobile) {
  return {
    position: new Position(32515, 32358, 7),
    __countryCode: countryCode,
    __isMobileClient: mobile,
    messages: [],
    isGM: () => false,
    sendCancelMessage(message) {
      this.messages.push(message);
    },
    payWithResource() {
      return true;
    }
  };
};

let players = new Map();
let partyPlayerCount = 0;
let creatures = new Map([
  [1, makeNPC("Różal")],
  [2, makeNPC("Pudzian")]
]);
let handler = {
  __creatureMap: creatures,
  getConnectedPlayers() {
    return players;
  },
  getPartyRadioPlayerCount() {
    return partyPlayerCount;
  },
  teleportCreature(player, position) {
    player.position = position;
    return true;
  }
};

const originalGameServer = global.gameServer;
global.gameServer = process.gameServer = {
  world: {
    getTileFromWorldPosition() {
      return {
        id: 1,
        isOccupiedCharacters: () => false
      };
    }
  }
};

let event = new PartyBouncerEvent(handler, {
  now: () => now,
  random: () => 0,
  settingsPath: false
});

let polish = makePlayer("PL", false);
let english = makePlayer("DE", false);
assert.strictEqual(event.getLanguage(polish), "pl");
assert.strictEqual(event.getLanguage(english), "en");
assert.strictEqual(event.__isControlPosition(new Position(32515, 32358, 7)), true);
assert.strictEqual(event.__isControlPosition(new Position(32515, 32359, 7)), true);
assert.strictEqual(event.__isControlPosition(new Position(32515, 32360, 7)), false);

event.__active = {
  player: polish,
  stage: "await_answer",
  attempts: 0,
  question: { answers: ["oczywiście", "jak najbardziej", "niebieskiego"] },
  spinDirections: new Set()
};
assert.strictEqual(event.handleSpeech(polish, "OCZYWISCIE!!!"), true);
assert.strictEqual(event.__active.stage, "grant_pending");
assert.match(spoken.at(-1).message, /odpowiedź|zgadza|zaliczona/i);
assert.ok(faced.every(entry => entry.player === polish));
assert.strictEqual(new Set(faced.map(entry => entry.name)).size, 2, "both bouncers must face the player");

faced = [];
players.set("Polish", polish);
polish.position = new Position(32515, 32359, 7);
event.__active = {
  player: polish,
  stage: "await_answer",
  attempts: 0,
  expiresAt: now + 10000,
  nextAt: Number.POSITIVE_INFINITY,
  question: { answers: ["yes"] },
  spinDirections: new Set()
};
event.tick();
assert.ok(faced.every(entry => entry.player === polish));
assert.strictEqual(new Set(faced.map(entry => entry.name)).size, 2, "both bouncers must track a moving player");
players.delete("Polish");

let mobile = makePlayer("PL", true);
event.__active = { player: mobile, stage: "starting", attempts: 0, spinDirections: new Set() };
event.__startChallenge();
assert.strictEqual(event.__active.stage, "await_answer", "mobile clients must only receive questions");
let firstQuestion = event.__active.question;
event.__active = { player: mobile, stage: "starting", attempts: 0, spinDirections: new Set() };
event.__startChallenge();
assert.notStrictEqual(
  event.__active.question,
  firstQuestion,
  "the same question must not be selected twice in a row"
);

let polishDesktop = makePlayer("PL", false);
event.__active = { player: polishDesktop, stage: "starting", attempts: 0, spinDirections: new Set() };
event.__startChallenge();
assert.strictEqual(spoken.at(-1).message, "Pokaż nam Twoje ruchy! Po prostu tańcz!");

let desktop = makePlayer("GB", false);
event.__active = { player: desktop, stage: "starting", attempts: 0, spinDirections: new Set() };
event.__startChallenge();
assert.strictEqual(event.__active.stage, "await_spin");
assert.strictEqual(spoken.at(-1).message, "Show us a spin! Simply: DANCE!");
event.handleTurn(desktop, CONST.DIRECTION.NORTH);
event.handleTurn(desktop, CONST.DIRECTION.EAST);
event.handleTurn(desktop, CONST.DIRECTION.SOUTH);
event.handleTurn(desktop, CONST.DIRECTION.WEST);
assert.strictEqual(event.__active.stage, "grant_pending");

event.__active = null;
assert.strictEqual(
  event.handleDestination(desktop, new Position(32515, 32357, 7)),
  false,
  "an uncleared player must not step onto the gate"
);
event.__active = {
  player: desktop,
  stage: "authorized",
  expiresAt: now + 1000
};
assert.strictEqual(event.handleDestination(desktop, new Position(32515, 32357, 7)), true);

let modeResult = event.setMode("payment", "250");
assert.strictEqual(modeResult.ok, true);
assert.match(event.getStatus(desktop), /payment \(250 gold\)/);

assert.strictEqual(IPCountry.normalizeIPAddress("::ffff:83.0.0.1"), "83.0.0.1");
assert.strictEqual(IPCountry.getCountryCode("83.0.0.1"), "PL");
assert.strictEqual(
  IPCountry.getCountryCode("8.8.8.8", { headers: { "cf-ipcountry": "PL" } }),
  "PL"
);

spoken = [];
now = 5000;
let queued = makePlayer("PL", false);
queued.position = new Position(32515, 32361, 7);
players.set("Queued", queued);
let openEvent = new PartyBouncerEvent(handler, {
  now: () => now,
  random: () => 0,
  settingsPath: false
});
openEvent.tick();
assert.ok(queued.position.equals(new Position(32515, 32361, 7)), "the physical queue must not teleport forward");
assert.strictEqual(openEvent.__active, null);
assert.strictEqual(spoken.at(-1).player, queued, "the first player must be invited to walk forward");
queued.position = new Position(32515, 32359, 7);
openEvent.tick();
assert.strictEqual(openEvent.__active.stage, "open_pending");
now += openEvent.getConfig().dialogueDelayMs;
openEvent.tick();
assert.strictEqual(openEvent.__active.stage, "authorized");
assert.strictEqual(spoken.at(-1).name, "Pudzian");
assert.match(spoken.at(-1).message, /wchodź|możesz/i);
assert.strictEqual(faced.at(-1).player, queued);
assert.strictEqual(faced.at(-1).name, "Pudzian", "the second bouncer must also face the admitted player");

partyPlayerCount = 1;
openEvent.__active = { player: queued, stage: "grant_pending" };
openEvent.__grant();
assert.match(spoken.at(-1).message, /Jedna osoba/);

partyPlayerCount = 12;
openEvent.__active = { player: queued, stage: "grant_pending" };
openEvent.__grant();
assert.match(spoken.at(-1).message, /12 osób/);

partyPlayerCount = 22;
openEvent.__active = { player: queued, stage: "grant_pending" };
openEvent.__grant();
assert.match(spoken.at(-1).message, /22 osoby/);

partyPlayerCount = 20;
openEvent.__active = { player: queued, stage: "grant_pending" };
openEvent.__grant();
assert.match(spoken.at(-1).message, /20 osób.*pełną parą/);

players.clear();
openEvent.__queue = [];
openEvent.__active = null;
creatures.forEach(npc => { npc.direction = CONST.DIRECTION.EAST; });
openEvent.tick();
creatures.forEach(npc => {
  assert.strictEqual(npc.direction, CONST.DIRECTION.SOUTH, "idle bouncers must face south");
});

for (let version of [740, 760]) {
  let definitions = require("../data/" + version + "/npcs/definitions.json");
  assert.deepStrictEqual(definitions.pudzian.position, { x: 32516, y: 32358, z: 7 });
}

global.gameServer.world.creatureHandler = { partyBouncers: openEvent };
let gm = makePlayer("PL", false);
gm.isGM = () => true;
let commands = new CommandHandler();
assert.strictEqual(commands.handle(gm, "/bouncers payment 500"), true);
assert.match(gm.messages.at(-1), /payment.*500/i);
commands.handle(gm, "/bouncers status");
assert.match(gm.messages.at(-1), /payment \(500 gold\)/i);

global.gameServer = process.gameServer = originalGameServer;

console.log("PASS: party bouncer languages, attendance, non-repeating challenges, gate passes and GeoIP work.");
