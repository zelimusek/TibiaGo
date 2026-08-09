"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(
  path.join(__dirname, "..", "client", "index.html"),
  "utf8"
);

const prototypeMatch = html.match(
  /<div id="character-element-prototype"[\s\S]*?<div class="character-element-bar">/
);
assert.ok(prototypeMatch, "the character nameplate prototype must exist");

const prototype = prototypeMatch[0];
const titleIndex = prototype.indexOf('class="party-title"');
const nameIndex = prototype.indexOf("<span></span>");
const healthIndex = prototype.indexOf('class="character-element-bar"');

assert.ok(titleIndex !== -1 && nameIndex !== -1 && healthIndex !== -1);
assert.ok(titleIndex < nameIndex, "the achievement title must render above the nickname");
assert.ok(nameIndex < healthIndex, "the nickname must remain above the health and mana bars");

console.log("PASS: achievement titles render above player nicknames.");
