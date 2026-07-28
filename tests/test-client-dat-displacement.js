"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const context = vm.createContext({
  Buffer,
  TextDecoder,
  TextEncoder,
  clearTimeout,
  console,
  performance: { now: () => 0 },
  setTimeout,
});

context.window = context;
context.global = context;
context.gameClient = {
  clientVersion: 760,
  spriteBuffer: { get: () => null },
  interface: { loadAssetCallback: () => {} },
};
vm.runInContext(
  "String.prototype.format = function () { let i = 0; const args = arguments; return this.replace(/%s/g, () => String(args[i++])); };",
  context
);

const clientFiles = [
  "client/src/utils/position.js",
  "client/src/network/packet.js",
  "client/src/network/packetreader.js",
  "client/src/utils/bitflag.js",
  "client/src/utils/dataobject.js",
  "client/src/utils/frame-group.js",
  "client/src/utils/object-buffer.js",
];
const exportsByFile = {
  "position.js": "this.Position = Position;",
  "packet.js": "this.Packet = Packet;",
  "packetreader.js": "this.PacketReader = PacketReader;",
  "bitflag.js": "this.BitFlagGenerator = BitFlagGenerator; this.PropBitFlag = PropBitFlag;",
  "dataobject.js": "this.DataObject = DataObject;",
  "frame-group.js": "this.FrameGroup = FrameGroup;",
  "object-buffer.js": "this.ObjectBuffer = ObjectBuffer;",
};

for (const relativeFile of clientFiles) {
  const absoluteFile = path.join(root, relativeFile);
  const source = fs.readFileSync(absoluteFile, "utf8")
    + "\n"
    + exportsByFile[path.basename(relativeFile)];
  vm.runInContext(source, context, { filename: absoluteFile });
}

const objectBuffer = new context.ObjectBuffer();
objectBuffer.__createLoopedAnimations = () => {};
objectBuffer.__createDistanceAnimations = () => {};
objectBuffer.__load(
  "Tibia.dat",
  fs.readFileSync(path.join(root, "client", "data", "760", "Tibia.dat"))
);

// The straight table/counter pieces are displaced by 8 pixels in Tibia 7.60.
// Their 2x2 corner pieces are not. This is the exact combination that must
// align in RME and in the browser client.
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(objectBuffer.dataObjects[2322].properties.displacement)),
  { x: 8, y: 8 }
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(objectBuffer.dataObjects[2323].properties.displacement)),
  { x: 8, y: 8 }
);
assert.strictEqual(objectBuffer.dataObjects[2324].properties.displacement, undefined);

const rendererFile = path.join(root, "client", "src", "rendering", "renderer.js");
vm.runInContext(
  fs.readFileSync(rendererFile, "utf8") + "\nthis.Renderer = Renderer;",
  context,
  { filename: rendererFile }
);
const renderer = Object.create(context.Renderer.prototype);
const displacedPosition = renderer.__applyThingDisplacement(
  new context.Position(10, 20, 0),
  {
    getDataObject: () => ({
      properties: { displacement: { x: 8, y: 8 } },
    }),
  }
);

assert.strictEqual(displacedPosition.x, 9.75);
assert.strictEqual(displacedPosition.y, 19.75);
console.log("PASS: Tibia.dat displacement is parsed and applied only to marked world objects.");
