"use strict";

const assert = require("assert");

require("../require");

const DefaultChannel = requireModule("channels/channel-default");

const calls = [];
const player = {
  getProperty() {
    return CONST.ROLES.PLAYER;
  },
  speechHandler: {
    internalCreatureWhisper(message, color) {
      calls.push(["whisper", message, color]);
    },
    internalCreatureSay(message, color) {
      calls.push(["say", message, color]);
    },
    internalCreatureYell(message, color) {
      calls.push(["yell", message, color]);
    },
  },
};

const channel = Object.create(DefaultChannel.prototype);
channel.commandHandler = {
  handle() {
    throw new Error("Regular speech must not be handled as a command.");
  },
};
channel.__NPCListen = function(speaker, message) {
  calls.push(["npc", speaker, message]);
};

assert.doesNotThrow(() => {
  channel.send(player, { loudness: 0, message: "Quiet" });
  channel.send(player, { loudness: 1, message: "Hello" });
  channel.send(player, { loudness: 2, message: "Loud" });
});

assert.deepStrictEqual(calls[0].slice(0, 2), ["whisper", "Quiet"]);
assert.deepStrictEqual(calls[1].slice(0, 2), ["say", "Hello"]);
assert.deepStrictEqual(calls[2], ["npc", player, "hello"]);
assert.deepStrictEqual(calls[3].slice(0, 2), ["yell", "Loud"]);

console.log("PASS: whisper, say and yell use the player's speech handler safely.");
