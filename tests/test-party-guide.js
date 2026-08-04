"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "client", "index.html"), "utf8");
const launcher = fs.readFileSync(path.join(root, "client", "src", "launcher.js"), "utf8");
const modalManager = fs.readFileSync(path.join(root, "client", "src", "ui", "modals", "modal-manager.js"), "utf8");
const definitions = JSON.parse(fs.readFileSync(path.join(root, "data", "760", "achievements.json"), "utf8"));

const guideMatch = html.match(/<div id="information-modal"[\s\S]*?<\/div>\s*<\/div>\s*<!-- Login Modal for Enter World -->/);
assert.ok(guideMatch, "Party Guide modal must exist before the login form");
const guide = guideMatch[0];

["Club Rules", "Minigames", "Achievements", "Club Ranks"].forEach(function (tab) {
  assert.ok(guide.includes(tab), "Party Guide must include the " + tab + " tab");
});
assert.strictEqual(guide.includes("/radio"), false, "the GOD-only /radio command must remain outside the public guide");
assert.ok(guide.includes("Party Guide"));
assert.ok(html.includes('<button id="information">Party Guide</button>'));
assert.ok(launcher.includes("modal-party-guide.js"));
assert.ok(modalManager.includes('this.register(PartyGuideModal, "information-modal")'));

assert.strictEqual(definitions.length, 15);
const byId = new Map(definitions.map(function (definition) { return [definition.id, definition]; }));
assert.strictEqual(byId.get("chain-reaction").target, 7);
assert.strictEqual(byId.get("smoke-machine").target, 500);
assert.strictEqual(byId.get("chair-dancer").target, 1);
assert.strictEqual(byId.get("chair-champion").target, 10);
assert.deepStrictEqual(byId.get("triple-crown").requirements, {
  lavaWins: 5,
  bomberEliminationWins: 5,
  bomberMayhemWins: 5,
  laserChairsWins: 5
});

console.log("PASS: Party Guide matches the public rules, ranks and 15-achievement ruleset.");
