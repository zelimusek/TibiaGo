"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "client", "index.html"), "utf8");
const interfaceSource = fs.readFileSync(
  path.join(root, "client", "src", "ui", "interface.js"),
  "utf8"
);

assert.match(
  html,
  /<button id="openParty"[^>]*>Party<\/button>/,
  "the former Quests sidebar button should be labelled Party"
);
assert.doesNotMatch(html, /<button id="openQuests"/, "the sidebar should no longer expose the Quests button");
assert.match(
  interfaceSource,
  /getElementById\("openParty"\)[\s\S]*?this\.openPartyAchievements\.bind\(this\)/,
  "the Party button should use the achievement request handler"
);
assert.match(
  interfaceSource,
  /Interface\.prototype\.openPartyAchievements[\s\S]*?new ChannelMessagePacket\([\s\S]*?CONST\.CHANNEL\.DEFAULT[\s\S]*?"\/achievements"/,
  "the Party button should request the same fresh overview as /achievements"
);

console.log("PASS: the Party sidebar button opens server-backed achievements.");
