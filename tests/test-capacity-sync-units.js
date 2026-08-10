"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "src", "player", "player.js"),
  "utf8"
);

const syncStart = source.indexOf("Player.prototype.syncProperties");
const cleanupStart = source.indexOf("Player.prototype.cleanup", syncStart);
const syncSource = source.slice(syncStart, cleanupStart);

assert.match(syncSource, /this\.__updateCurrentCapacity\(\)/);
assert.doesNotMatch(syncSource, /maxCapacity\s*-\s*totalWeight/);
assert.match(source, /let maxCapacityUnits = maxCapacity \* 100/);
assert.match(source, /Math\.floor\(currentCapacity \/ 100\)/);

console.log("PASS: saved capacity uses the same hundredth-ounce conversion as login.");
