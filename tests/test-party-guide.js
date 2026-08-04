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
assert.strictEqual(guide.includes("/bomb"), false, "the obsolete /bomb command must remain outside the public guide");
assert.ok(guide.includes("Bomberman Bomb"), "Bomberman instructions must name the hotkey spell");
assert.strictEqual(guide.includes("If nobody claims one, the round repeats."), false);
assert.ok(guide.includes("See how you rank against the whole club in Party Maniacs."));
["achievement-rare", "achievement-epic", "achievement-legendary"].forEach(function (rarityClass) {
  assert.ok(guide.includes(rarityClass), "Party Guide must show " + rarityClass + " achievement colours");
});
assert.ok(guide.includes("Party Guide"));
assert.ok(html.includes('<button id="information">Party Guide</button>'));
assert.strictEqual(html.includes('id="settings-box"'), false, "the obsolete connection settings modal must be removed");
assert.ok(html.includes('id="clear-database"'), "shared settings must include client maintenance");
assert.ok(launcher.includes("modal-party-guide.js"));
assert.ok(modalManager.includes('this.register(PartyGuideModal, "information-modal")'));
assert.ok(modalManager.includes('this.__openSettings.bind(this, true)'), "login Options must open the shared settings panel");
assert.ok(modalManager.includes('this.__openSettings.bind(this, false)'), "in-game Settings must open the shared settings panel");

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
