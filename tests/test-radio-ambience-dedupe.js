"use strict";

const assert = require("assert");

require("../require");

const CreatureHandler = requireModule("core/world-creature-handler");
const getKey = CreatureHandler.prototype.__getRadioAmbienceKey;

const first = {
  weather: "none",
  spotlightFocus: {
    targetId: 123,
    targetPosition: { x: 32515, y: 32346, z: 7 },
    elapsedMs: 100,
    durationMs: 12000
  },
  partyFlow: {
    phase: "lobby",
    elapsedMs: 200,
    animationElapsedMs: 200,
    durationMs: 15000
  }
};

const later = JSON.parse(JSON.stringify(first));
later.spotlightFocus.elapsedMs = 900;
later.partyFlow.elapsedMs = 1000;
later.partyFlow.animationElapsedMs = 1000;

assert.strictEqual(
  getKey(first),
  getKey(later),
  "countdown and animation elapsed time must not defeat radio ambience deduplication"
);

later.partyFlow.phase = "roulette";
assert.notStrictEqual(
  getKey(first),
  getKey(later),
  "a real party-flow state transition must still be synchronized"
);

later.partyFlow.phase = "lobby";
later.spotlightFocus.targetPosition.x++;
assert.notStrictEqual(
  getKey(first),
  getKey(later),
  "a moving effect target must still be synchronized"
);

console.log("PASS: volatile radio elapsed time no longer causes redundant packets.");
