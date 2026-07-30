"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
let scheduledMilliseconds = null;
let cancelMessage = null;

const commandContext = vm.createContext({
  console,
  URL,
  gameServer: {
    scheduleRestart: (milliseconds) => {
      scheduledMilliseconds = milliseconds;
      return true;
    },
  },
  module: { exports: {} },
  exports: {},
  require,
  requireModule: (name) => {
    if (name === "utils/position") {
      return function Position(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
      };
    }
    if (name === "npc/npc") {
      return function NPC() {};
    }
    if (name === "network/protocol") {
      return {
        ServerMessagePacket: function ServerMessagePacket() {},
        CreaturePropertyPacket: function CreaturePropertyPacket() {},
        RadioStreamPacket: function RadioStreamPacket() {},
      };
    }
    return function MockModule() {};
  },
});
commandContext.window = commandContext;
commandContext.global = commandContext;

const commandFile = path.join(root, "src", "utils", "command-handler.js");
vm.runInContext(
  fs.readFileSync(commandFile, "utf8") + "\nthis.CommandHandler = CommandHandler;",
  commandContext,
  { filename: commandFile }
);

const commandHandler = new commandContext.CommandHandler();
const god = {
  isGM: () => true,
  sendCancelMessage: (message) => {
    cancelMessage = message;
    return message;
  },
};

commandHandler.handle(god, "/restart 30");
assert.strictEqual(scheduledMilliseconds, 30000);
assert.strictEqual(cancelMessage, "Server restart scheduled in 30 seconds.");

scheduledMilliseconds = null;
commandHandler.handle(god, "/restart");
assert.strictEqual(scheduledMilliseconds, 10000);

scheduledMilliseconds = null;
commandHandler.handle(god, "/restart 0");
assert.strictEqual(scheduledMilliseconds, null);
assert.strictEqual(cancelMessage, "Usage: /restart [seconds from 1 to 300]");

const regularPlayer = {
  isGM: () => false,
  sendCancelMessage: (message) => message,
};
assert.strictEqual(
  commandHandler.handle(regularPlayer, "/restart 10"),
  "Only GMs can use game master commands."
);

const gameServerSource = fs.readFileSync(
  path.join(root, "src", "core", "gameserver.js"),
  "utf8"
);
assert.match(gameServerSource, /GameServer\.prototype\.scheduleRestart/);
assert.match(gameServerSource, /detached:\s*true/);
assert.match(gameServerSource, /this\.shutdown\(\)/);
assert.match(gameServerSource, /fs\.writeFileSync\(pidFile/);
assert.match(gameServerSource, /}, 5000\)/);

console.log("PASS: only GM/GOD can schedule a graceful detached server restart.");
