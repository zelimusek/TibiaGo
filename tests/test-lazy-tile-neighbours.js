"use strict";

const assert = require("assert");

process.env.TIBIAGO_LAZY_TILE_NEIGHBOURS = "true";
require("../require");

const Lattice = requireModule("parsers/lattice");
const Position = requireModule("utils/position");
const Tile = requireModule("entities/tile");

const lattice = new Lattice(new Position(18, 14, 8));
const tiles = new Map();

function addTile(x, y) {
  const position = new Position(x, y, 0);
  const tile = new Tile(0, position);
  tile.isBlockSolid = () => false;
  tiles.set(position.toString(), tile);
  return tile;
}

const center = addTile(5, 5);
const north = addTile(5, 4);
const east = addTile(6, 5);

lattice.getTileFromWorldPosition = position =>
  tiles.get(position.toString()) || null;

lattice.enablePathfinding(center, false);

assert.strictEqual(
  Object.prototype.hasOwnProperty.call(center, "__neighbours"),
  false,
  "lazy mode must not retain a neighbour array on each tile"
);
assert.deepStrictEqual(
  new Set(center.neighbours),
  new Set([center, north, east]),
  "lazy mode must resolve the same walkable neighbours on demand"
);

east.isBlockSolid = () => true;
assert.deepStrictEqual(
  new Set(center.neighbours),
  new Set([center, north]),
  "lazy neighbours must reflect blocking changes without cache refresh"
);

CONFIG.WORLD.LAZY_TILE_NEIGHBOURS = false;
const eagerLattice = new Lattice(new Position(18, 14, 8));
const eagerCenter = new Tile(0, new Position(8, 8, 0));
eagerCenter.isBlockSolid = () => false;
eagerLattice.getTileFromWorldPosition = position =>
  position.equals(eagerCenter.position) ? eagerCenter : null;
eagerLattice.enablePathfinding(eagerCenter, false);

assert.strictEqual(
  Object.prototype.hasOwnProperty.call(eagerCenter, "__neighbours"),
  true,
  "rollback mode must retain the original eager neighbour array"
);
assert.deepStrictEqual(
  eagerCenter.neighbours,
  [eagerCenter],
  "rollback mode must preserve eager neighbour behaviour"
);

console.log("Lazy tile neighbour tests passed.");
