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
assert.match(selectedRule[1], /color:\s*#ffe36b/i, "the active channel label should be highlighted");
assert.match(selectedRule[1], /inset\s+0\s+3px\s+0\s+#ffd84a/i, "the active channel needs a bright top marker");
assert.match(selectedRule[1], /text-shadow:/i, "the active label should remain legible on the dark texture");
assert.match(selectedRule[1], /linear-gradient/i, "the active channel background should differ visibly");

console.log("PASS: active chat channels have a high-contrast visual marker.");
