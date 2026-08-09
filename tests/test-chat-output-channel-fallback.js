"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const context = vm.createContext({
  console,
  CONST: { CHANNEL: { LOOT: 0x04 } },
  document: {
    activeElement: { blur() {} }
  }
});

const channelManagerFile = path.join(
  __dirname,
  "..",
  "client",
  "src",
  "utils",
  "channel-manager.js"
);
vm.runInContext(
  fs.readFileSync(channelManagerFile, "utf8") + "\nthis.ChannelManager = ChannelManager;",
  context,
  { filename: channelManagerFile }
);

function LocalChannel() {}
function PrivateChannel() {}
function PublicChannel() {}

context.LocalChannel = LocalChannel;
context.PrivateChannel = PrivateChannel;
context.ChannelMessagePacket = function(channelId, loudness, message) {
  this.channelId = channelId;
  this.loudness = loudness;
  this.message = message;
};

const defaultChannel = { constructor: PublicChannel, id: 0, name: "Default" };
const lootChannel = { constructor: PublicChannel, id: 0x04, name: "Loot" };
const consoleChannel = { constructor: LocalChannel, name: "Console" };

function sendFrom(activeChannel, message) {
  const packets = [];
  let selectedChannel = null;
  let locked = false;
  const manager = Object.create(context.ChannelManager.prototype);

  manager.__inputElement = { value: message };
  manager.__messageHistory = [];
  manager.__messageHistoryIndex = 0;
  manager.__messageHistoryDraft = "";
  manager.getActiveChannel = () => activeChannel;
  manager.getChannelById = id => id === 0 ? defaultChannel : null;
  manager.setActiveChannelElement = channel => { selectedChannel = channel; };
  manager.getLoudness = () => 1;
  manager.setInputLocked = value => { locked = value; };

  context.gameClient = {
    send(packet) { packets.push(packet); }
  };

  manager.handleMessageSend();

  return { manager, packets, selectedChannel, locked };
}

for(const sourceChannel of [lootChannel, consoleChannel]) {
  const result = sendFrom(sourceChannel, "Hello dance floor!");

  assert.strictEqual(result.packets.length, 1, sourceChannel.name + " should send one message");
  assert.strictEqual(result.packets[0].channelId, 0, sourceChannel.name + " should redirect to Default");
  assert.strictEqual(result.packets[0].message, "Hello dance floor!");
  assert.strictEqual(result.selectedChannel, defaultChannel, sourceChannel.name + " should open Default");
  assert.strictEqual(result.locked, true, "chat should lock after sending from " + sourceChannel.name);
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(result.manager.__messageHistory)),
    ["Hello dance floor!"],
    sourceChannel.name + " message should remain in chat history"
  );
}

console.log("PASS: Loot and Console chat input falls back to Default.");
