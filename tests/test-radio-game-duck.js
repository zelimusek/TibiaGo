"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function Trace() {}
Trace.prototype.tick = function () {};
Trace.prototype.stop = function () {};
Trace.prototype.setVolume = function () {};
function Bit() {}

function AudioMock(url) {
  this.url = url;
  this.volume = 1;
  this.pausedByGame = false;
}
AudioMock.prototype.play = function () { return null; };
AudioMock.prototype.pause = function () { this.pausedByGame = true; };
AudioMock.prototype.removeAttribute = function () {};
AudioMock.prototype.load = function () {};

const context = vm.createContext({
  console,
  Object,
  Math,
  SoundTrace: Trace,
  SoundBit: Bit,
  Audio: AudioMock,
  gameClient: {
    interface: {
      settings: { isSoundEnabled: () => true },
      soundManager: null
    }
  }
});

const source = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "audio", "sound-manager.js"),
  "utf8"
);
vm.runInContext(source + "\nthis.SoundManager = SoundManager;", context);

const manager = new context.SoundManager(true);
context.gameClient.interface.soundManager = manager;
manager.setRadioStream("https://example.com/live", 0.75);
const stream = manager.__radioStream;
assert.strictEqual(stream.volume, 0.75);

manager.setRadioGameDuck(true);
for (let index = 0; index < 60; index++) manager.tick();
assert.strictEqual(manager.__radioStream, stream, "ducking must keep the same live stream instance");
assert.strictEqual(stream.pausedByGame, false, "ducking must not pause or restart internet radio");
assert.ok(stream.volume < 0.002, "the claiming phase must fade radio to silence");

manager.setRadioGameDuck(false);
for (let index = 0; index < 60; index++) manager.tick();
assert.ok(Math.abs(stream.volume - 0.75) < 0.002, "radio must fade back to its zone volume after claiming");
manager.setMasterVolume(0.5);
assert.ok(Math.abs(stream.volume - 0.375) < 0.002, "master and zone volume must remain independent from game ducking");

console.log("PASS: Laser Chairs fades radio without pausing, replacing or desynchronizing the stream.");
