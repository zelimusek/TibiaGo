"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
let now = 1000;
let energy = 30;

function SoundTrace() {}
SoundTrace.prototype.tick = function() {};
SoundTrace.prototype.stop = function() {};
SoundTrace.prototype.setVolume = function() { return this; };

function SoundBit() {}
SoundBit.prototype.play = function() {};
SoundBit.prototype.stop = function() {};

const context = vm.createContext({
  console,
  Math,
  Number,
  Object,
  Promise,
  Uint8Array,
  SoundTrace,
  SoundBit,
  performance: { now: () => now },
  window: {},
});

const source = fs.readFileSync(
  path.join(root, "client", "src", "audio", "sound-manager.js"),
  "utf8"
);
vm.runInContext(source + "\nthis.SoundManager = SoundManager;", context);

const manager = new context.SoundManager(true);
manager.__radioAudioContext = {
  state: "running",
  sampleRate: 44100,
};
manager.__radioAnalyser = {
  fftSize: 2048,
  frequencyBinCount: 1024,
  getByteFrequencyData(buffer) {
    buffer.fill(energy);
  },
};
manager.__radioFrequencyData = new Uint8Array(1024);

function sample(value, advance) {
  energy = value;
  now += advance;
  manager.__sampleRadioRhythm(now);
}

for(let index = 0; index < 24; index++) sample(30, 16);
sample(125, 32);
assert.strictEqual(manager.__radioRhythm.beatSequence, 1, "a clear bass transient should register as a beat");

for(let index = 0; index < 25; index++) sample(30, 16);
sample(130, 32);
assert.strictEqual(manager.__radioRhythm.beatSequence, 2, "a later transient should register after the cooldown");

let detected = manager.getRadioRhythm(140, now);
assert.strictEqual(detected.source, "bass", "fresh analyser beats should drive the radio rhythm");
assert.ok(detected.bpm > 125 && detected.bpm < 155, "detected tempo should normalize near the configured 140 BPM");
assert.ok(detected.pulse > 0.5, "a fresh bass hit should produce a visible pulse");

manager.__radioRhythm.beatInterval = 60000 / 70;
let slowed = manager.getRadioRhythm(140, now);
assert.ok(slowed.bpm > 69 && slowed.bpm < 71, "a genuinely slower song must override the configured fallback BPM");

now += 5000;
let fallback = manager.getRadioRhythm(140, now);
assert.strictEqual(fallback.source, "bpm", "stale or missing audio analysis must fall back to configured BPM");
assert.strictEqual(fallback.bpm, 140, "the /radio BPM must be preserved by the fallback");
assert.ok(fallback.pulse >= 0 && fallback.pulse <= 1);

manager.setRadioRhythmConfig("fixed", 85);
let fixed = manager.getRadioRhythm(120, now);
assert.strictEqual(fixed.source, "fixed", "fixed mode must ignore detected bass beats");
assert.strictEqual(fixed.bpm, 120, "fixed mode must preserve the configured BPM");
assert.strictEqual(manager.__radioBassSensitivity, 85, "the configured bass sensitivity should be retained");

manager.setRadioRhythmConfig("auto", 500);
assert.strictEqual(manager.__radioRhythmMode, "auto");
assert.strictEqual(manager.__radioBassSensitivity, 100, "bass sensitivity must be clamped safely");

function detectModerateTransient(sensitivity) {
  let detector = new context.SoundManager(true);
  let detectorEnergy = 50;
  detector.setRadioRhythmConfig("auto", sensitivity);
  detector.__radioAudioContext = { state: "running", sampleRate: 44100 };
  detector.__radioAnalyser = {
    fftSize: 2048,
    frequencyBinCount: 1024,
    getByteFrequencyData(buffer) { buffer.fill(detectorEnergy); },
  };
  detector.__radioFrequencyData = new Uint8Array(1024);
  for(let index = 0; index < 24; index++) {
    now += 16;
    detector.__sampleRadioRhythm(now);
  }
  detectorEnergy = 68;
  now += 250;
  detector.__sampleRadioRhythm(now);
  return detector.__radioRhythm.beatSequence;
}

assert.strictEqual(detectModerateTransient(1), 0, "low sensitivity should reject a moderate transient");
assert.strictEqual(detectModerateTransient(100), 1, "high sensitivity should accept the same transient");

console.log("Radio bass rhythm and BPM fallback tests passed.");
