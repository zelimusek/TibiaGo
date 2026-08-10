"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "client", "src", "ui", "window-battle.js"),
  "utf8"
);
const mobileCss = fs.readFileSync(
  path.join(root, "client", "css", "mobile.css"),
  "utf8"
);
const desktopCss = fs.readFileSync(
  path.join(root, "client", "css", "new.css"),
  "utf8"
);
const indexHtml = fs.readFileSync(
  path.join(root, "client", "index.html"),
  "utf8"
);
const creatureSource = fs.readFileSync(
  path.join(root, "client", "src", "entities", "creature.js"),
  "utf8"
);
const characterElementSource = fs.readFileSync(
  path.join(root, "client", "src", "ui", "screen-element-character.js"),
  "utf8"
);

function InteractiveWindow() {}
InteractiveWindow.prototype = {};

const context = vm.createContext({
  console,
  InteractiveWindow,
  setTimeout,
  CONST: {
    TYPES: { PLAYER: 0, MONSTER: 1, NPC: 2 },
  },
  gameClient: {
    touch: { isMobileMode: true },
  },
  Interface: function Interface() {},
});
context.Interface.prototype.COLORS = { LIGHTGREEN: 30, ORANGE: 198, RED: 180, DARKRED: 108 };
context.Interface.prototype.getHexColor = () => "#00FF00";

vm.runInContext(
  "String.prototype.format = function () { " +
    "var args = arguments; var index = 0; " +
    "return this.replace(/%s/g, function () { return args[index++]; }); };",
  context
);

vm.runInContext(source + "\nthis.BattleWindow = BattleWindow;", context, {
  filename: "window-battle.js",
});

const battle = Object.create(context.BattleWindow.prototype);
assert.strictEqual(battle.__isBattleCreature({ type: 0 }), true);
assert.strictEqual(battle.__isBattleCreature({ type: 1 }), true);
assert.strictEqual(battle.__isBattleCreature({ type: 2 }), false);
assert.strictEqual(battle.__isBattleCreature(null), false);

assert.deepStrictEqual(
  JSON.parse(JSON.stringify(battle.__getCreaturePreviewLayout({
    characterGroup: { width: 1, height: 1 },
    mountGroup: null,
  }, false))),
  { canvasSize: 32, anchor: 0 },
  "a one-tile outfit must be drawn inside the 32px preview"
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(battle.__getCreaturePreviewLayout({
    characterGroup: { width: 2, height: 2 },
    mountGroup: { width: 3, height: 2 },
  }, true))),
  { canvasSize: 96, anchor: 2 },
  "large mounted outfits must fit inside the preview before CSS scaling"
);

const sentPackets = [];
let cursor = "crosshair";
let toggledCreature = null;
const creature = {
  id: 77,
  type: 1,
  getPosition: () => ({ x: 100, y: 200, z: 7 })
};
context.ItemUseOnCreaturePacket = function ItemUseOnCreaturePacket(item, id) {
  this.item = item;
  this.id = id;
};
context.ItemLookPacket = function ItemLookPacket(object) {
  this.object = object;
};
context.gameClient.mouse = {
  __multiUseObject: { id: 2281 },
  setCursor(value) { cursor = value; },
};
context.gameClient.send = (packet) => sentPackets.push(packet);
context.gameClient.world = {
  getCreature: () => creature,
  getTileFromWorldPosition: () => ({ id: "look-tile" }),
  toggleCreatureTarget(value) { toggledCreature = value; },
};

battle.__activateCreature({ id: "77" });
assert.strictEqual(sentPackets.length, 1);
assert.strictEqual(sentPackets[0].id, 77);
assert.strictEqual(context.gameClient.mouse.__multiUseObject, null);
assert.strictEqual(cursor, "auto");
assert.strictEqual(toggledCreature, null);

battle.__activateCreature({ id: "77" });
assert.strictEqual(toggledCreature, creature);

assert.strictEqual(battle.__lookCreature({ id: "77" }), true);
assert.strictEqual(sentPackets.length, 2);
assert.strictEqual(sentPackets[1].object.which.id, "look-tile");

const hpText = { textContent: "" };
const hpFill = { style: {} };
const hpWrapper = {
  style: {},
  querySelector(selector) {
    if (selector === ".bar-text") return hpText;
    if (selector === ".bar-holder") return { style: {} };
    return hpFill;
  },
};
const manaWrapper = { style: {}, querySelector() { return null; } };
const nameNode = { textContent: "" };
const loginEntry = {
  style: {},
  dataset: { outfitSignature: JSON.stringify("login-outfit") },
  firstElementChild: { firstElementChild: nameNode },
  classList: { toggle() {} },
  setAttribute() {},
  querySelectorAll() { return [hpWrapper, manaWrapper]; },
};
const loginCreature = {
  id: 88,
  type: 1,
  name: "Login Demon",
  state: { health: 75, mana: 0 },
  maxHealth: 100,
  maxMana: 0,
  outfit: { serialize: () => "login-outfit" },
  getHealthColor: () => 30,
};

context.gameClient.player = null;
context.gameClient.isSelf = () => false;
battle.getBody = () => ({ querySelector: () => loginEntry });
battle.__scheduleLayout = () => {};

assert.doesNotThrow(
  () => battle.updateCreature(loginCreature),
  "creature packets may reach the Battle List before the local player is created"
);
assert.strictEqual(loginEntry.style.display, "flex");
assert.strictEqual(hpText.textContent, "75%");

assert.match(source, /__multiUseObject[\s\S]*?ItemUseOnCreaturePacket/);
assert.match(source, /event\.shiftKey[\s\S]*?__lookCreature/);
assert.match(source, /getHealthColor\(hpPercent \/ 100\)/);
assert.match(creatureSource, /getHealthColor[\s\S]*?LIGHTGREEN[\s\S]*?ORANGE[\s\S]*?RED[\s\S]*?DARKRED/);
assert.match(characterElementSource, /creature instanceof Player/);
assert.match(source, /touchMoved[\s\S]*?touchmove[\s\S]*?touchend/);
assert.match(source, /Math\.max\(dx, dy\)/);
assert.match(mobileCss, /#battle-window > \.body\s*\{[\s\S]*?display: flex !important/);
assert.match(mobileCss, /battle-window-bar-wrapper \+ \.battle-window-bar-wrapper[\s\S]*?display: none !important/);
assert.match(mobileCss, /width: clamp\(126px, 34vw, 142px\)/);
assert.match(desktopCss, /battle-window-target-canvas[\s\S]*?align-items: flex-end/);
assert.match(mobileCss, /battle-window-target-canvas[\s\S]*?align-items: flex-end/);
assert.match(indexHtml, /battle-window-bar-wrapper battle-window-health-bar/);
assert.match(desktopCss, /battle-window-health-bar \.bar-holder[\s\S]*?border-color: #00C000/);

console.log("PASS: mobile Battle List stays compact, sortable and touch-safe.");
