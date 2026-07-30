"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const context = vm.createContext({
  console,
  performance: { now: () => 0 },
});

context.window = context;
context.global = context;
context.gameClient = {
  world: {
    getTileFromWorldPosition: () => ({ __renderElevation: 0.5 }),
  },
};

const positionFile = path.join(root, "client", "src", "utils", "position.js");
vm.runInContext(
  fs.readFileSync(positionFile, "utf8") + "\nthis.Position = Position;",
  context,
  { filename: positionFile }
);

const rendererFile = path.join(root, "client", "src", "rendering", "renderer.js");
vm.runInContext(
  fs.readFileSync(rendererFile, "utf8") + "\nthis.Renderer = Renderer;",
  context,
  { filename: rendererFile }
);

const renderer = Object.create(context.Renderer.prototype);
renderer.getStaticScreenPosition = () => new context.Position(10, 20);

const creature = {
  getPosition: () => new context.Position(100, 100, 7),
  getMoveOffset: () => new context.Position(0.25, 0.125),
};

const elevatedPosition = renderer.getCreatureScreenPosition(creature);
assert.strictEqual(elevatedPosition.x, 9.25);
assert.strictEqual(elevatedPosition.y, 19.375);

context.gameClient.world.getTileFromWorldPosition = () => null;
const flatPosition = renderer.getCreatureScreenPosition(creature);
assert.strictEqual(flatPosition.x, 9.75);
assert.strictEqual(flatPosition.y, 19.875);

const rendererSource = fs.readFileSync(rendererFile, "utf8");
const renderCreatureBody = rendererSource.slice(
  rendererSource.indexOf("Renderer.prototype.__renderCreature ="),
  rendererSource.indexOf("Renderer.prototype.__defer =")
);
assert.doesNotMatch(
  renderCreatureBody,
  /position\.[xy]\s*-\s*tile\.__renderElevation/,
  "The creature sprite must not subtract tile elevation a second time."
);

const characterElementSource = fs.readFileSync(
  path.join(root, "client", "src", "ui", "screen-element-character.js"),
  "utf8"
);
assert.match(
  characterElementSource,
  /renderer\.getCreatureScreenPosition\(this\.__creature\)/,
  "The DOM name and health plate must use the same elevated anchor as the sprite."
);

console.log("PASS: creature sprites, labels, bars and overlays share tile elevation.");
