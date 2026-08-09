"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(
  path.join(__dirname, "..", "client", "css", "chatbox.css"),
  "utf8"
);

const selectedRule = css.match(/\.chat-title\.selected\s*\{([\s\S]*?)\}/);
assert.ok(selectedRule, "the active chat channel needs a selected style");
assert.match(selectedRule[1], /color:\s*#fff/i, "the active channel label should stay white");
assert.match(selectedRule[1], /border-color:\s*#9b7a19/i, "the active channel needs a thin gold outline");
assert.match(selectedRule[1], /border-bottom:\s*0/i, "the active tab should open into the chat body");
assert.match(selectedRule[1], /box-shadow:\s*none/i, "the active tab should not use a bright glow");
assert.doesNotMatch(selectedRule[1], /linear-gradient/i, "the active tab should keep its dark texture");

console.log("PASS: active chat channels use the restrained outlined style.");
