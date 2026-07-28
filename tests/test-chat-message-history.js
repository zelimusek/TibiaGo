"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sourceFile = path.join(
  __dirname,
  "..",
  "client",
  "src",
  "utils",
  "channel-manager.js"
);
const context = vm.createContext({ console });
vm.runInContext(
  fs.readFileSync(sourceFile, "utf8") + "\nthis.ChannelManager = ChannelManager;",
  context,
  { filename: sourceFile }
);

const manager = Object.create(context.ChannelManager.prototype);
manager.__inputElement = { value: "" };
manager.__messageHistory = [];
manager.__messageHistoryIndex = 0;
manager.__messageHistoryDraft = "";

[
  "first",
  "second",
  "/m Dragon",
  "/a 4",
  "/radio",
  "/waypoint disco",
].forEach((message) => manager.__rememberMessage(message));

assert.deepStrictEqual(
  JSON.parse(JSON.stringify(manager.__messageHistory)),
  ["second", "/m Dragon", "/a 4", "/radio", "/waypoint disco"],
  "Only the five latest inputs, including GM commands, should be retained."
);

manager.__inputElement.value = "unfinished draft";
manager.suggestPrevious();
assert.strictEqual(manager.__inputElement.value, "/waypoint disco");
manager.suggestPrevious();
assert.strictEqual(manager.__inputElement.value, "/radio");
manager.suggestPrevious();
manager.suggestPrevious();
manager.suggestPrevious();
manager.suggestPrevious();
assert.strictEqual(manager.__inputElement.value, "second", "History must stop at its oldest entry.");

manager.suggestNext();
assert.strictEqual(manager.__inputElement.value, "/m Dragon");
manager.suggestNext();
manager.suggestNext();
manager.suggestNext();
manager.suggestNext();
assert.strictEqual(
  manager.__inputElement.value,
  "unfinished draft",
  "Moving past the latest entry must restore the unfinished draft."
);

console.log("PASS: chat remembers and navigates the five latest inputs, including GM commands.");
