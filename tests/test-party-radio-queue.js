"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const PartyRadioQueue = require("../src/core/party-radio-queue");

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tibiago-party-radio-"));
const musicDirectory = path.join(temporaryRoot, "party-music");
fs.mkdirSync(musicDirectory);
fs.writeFileSync(path.join(musicDirectory, "01 First Song.mp3"), Buffer.from("test"));
fs.writeFileSync(path.join(musicDirectory, "02_second_song.MP3"), Buffer.from("test"));
fs.writeFileSync(path.join(musicDirectory, "ignore.txt"), Buffer.from("test"));

try {
  let broadcasts = [];
  let queue = new PartyRadioQueue({
    resyncRadioZonePlayers: function (zoneId) { broadcasts.push(zoneId); }
  }, {
    musicDirectory: musicDirectory,
    publicBase: "/party-music/"
  });

  let library = queue.getLibrary();
  assert.strictEqual(library.length, 2, "only MP3 files should enter the library");
  assert.strictEqual(library[0].name, "01 First Song");
  assert(library[0].url.includes("01%20First%20Song.mp3"), "music URLs should be safely encoded");

  let result = queue.start("radio-test", [
    { id: library[0].id, durationMs: 5000 },
    { id: library[1].id, durationMs: 7000 }
  ], "radio");
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(broadcasts, ["radio-test"]);

  let first = queue.getPlayback("radio-test");
  assert(first && first.startsInMs > 0, "the first track should have a synchronization lead-in");
  assert.strictEqual(first.index, 0);

  queue.tick(Date.now() + 8000);
  let second = queue.getPlayback("radio-test");
  assert(second, "the second track should be active");
  assert.strictEqual(second.index, 1);
  assert.strictEqual(broadcasts.length, 2, "track changes should be pushed without player movement");

  queue.tick(Date.now() + 16000);
  assert.strictEqual(queue.getPlayback("radio-test"), null, "the queue should return to live radio after its final track");
  assert.strictEqual(broadcasts.length, 3, "returning to live radio should be pushed to listeners");

  console.log("Party radio queue tests passed.");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
