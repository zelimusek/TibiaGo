"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

require("../require");

const CreatureHandler = requireModule("core/world-creature-handler");
const PlayerMovementHandler = requireModule("player/player-movement-handler");
const ServerPosition = requireModule("utils/position");

const BASE_STEP_DURATION = 8;
const DIAGONAL_STEP_DURATION = BASE_STEP_DURATION * 3;

function makePosition(x, y) {
  const position = new ServerPosition(x, y, 7);
  position.getPositionFromDirection = function (direction) {
    return direction;
  };
  return position;
}

const origin = makePosition(100, 100);
const cardinalDestination = makePosition(101, 100);
const diagonalDestination = makePosition(101, 101);

(function testRealPositionContracts() {
  const serverOrigin = new ServerPosition(100, 100, 7);
  const serverCases = [
    [new ServerPosition(101, 100, 7), 1],
    [new ServerPosition(99, 100, 7), 1],
    [new ServerPosition(100, 101, 7), 1],
    [new ServerPosition(100, 99, 7), 1],
    [new ServerPosition(101, 101, 7), 3],
    [new ServerPosition(99, 101, 7), 3],
    [new ServerPosition(101, 99, 7), 3],
    [new ServerPosition(99, 99, 7), 3],
    [new ServerPosition(101, 101, 6), 1],
    [new ServerPosition(102, 101, 7), 1],
  ];

  for (const [destination, expected] of serverCases) {
    assert.strictEqual(
      serverOrigin.getWalkDurationMultiplier(destination),
      expected
    );
  }

  const clientPositionFile = path.join(
    __dirname,
    "..",
    "client",
    "src",
    "utils",
    "position.js"
  );
  const clientContext = vm.createContext({ console });
  vm.runInContext(
    fs.readFileSync(clientPositionFile, "utf8") +
      "\nthis.ClientPosition = Position;",
    clientContext,
    { filename: clientPositionFile }
  );

  const clientOrigin = new clientContext.ClientPosition(100, 100, 7);
  for (const [destination, expected] of serverCases) {
    const clientDestination = new clientContext.ClientPosition(
      destination.x,
      destination.y,
      destination.z
    );
    assert.strictEqual(
      clientOrigin.getWalkDurationMultiplier(clientDestination),
      expected,
      "client and server Position must classify steps identically"
    );
  }
})();

const destinationTile = {
  id: 1,
  getFriction() {
    return 100;
  },
  hasDestination() {
    return false;
  },
  emit() {},
  hasItems() {
    return false;
  },
  hasElevation() {
    return false;
  },
  isOccupied() {
    return false;
  },
  isProtectionZone() {
    return false;
  },
};

const originTile = {
  emit() {},
  hasElevation() {
    return false;
  },
};

const originalProcessGameServer = process.gameServer;
const originalGlobalGameServer = global.gameServer;

function getServerLockDuration(destination) {
  let lockedFor = null;
  const movementHandler = Object.create(PlayerMovementHandler.prototype);

  movementHandler.__player = {
    isDead: false,
    position: origin,
    getPosition() {
      return origin;
    },
    getStepDuration() {
      return BASE_STEP_DURATION;
    },
  };
  movementHandler.__moveLock = {
    isLocked() {
      return false;
    },
    lock(duration) {
      lockedFor = duration;
    },
  };

  gameServer.world.getTileFromWorldPosition = function () {
    return destinationTile;
  };
  gameServer.world.creatureHandler = {
    moveCreature() {
      return true;
    },
  };

  movementHandler.handleMovement(destination);
  return lockedFor;
}

function getRejectedServerLockDuration(destination) {
  let lockedFor = null;
  const movementHandler = Object.create(PlayerMovementHandler.prototype);

  movementHandler.__player = {
    isDead: false,
    position: origin,
    getPosition() {
      return origin;
    },
    getStepDuration() {
      return BASE_STEP_DURATION;
    },
  };
  movementHandler.__moveLock = {
    isLocked() {
      return false;
    },
    lock(duration) {
      lockedFor = duration;
    },
  };

  gameServer.world.getTileFromWorldPosition = function () {
    return destinationTile;
  };
  gameServer.world.creatureHandler = {
    moveCreature() {
      return false;
    },
    teleportCreature() {
      return true;
    },
  };

  movementHandler.handleMovement(destination);
  return lockedFor;
}

function getServerPacketDuration(destination) {
  let movementPacket = null;
  const handler = Object.create(CreatureHandler.prototype);
  const creature = {
    position: origin,
    isPlayer() {
      return true;
    },
    isDrunk() {
      return false;
    },
    isTileOccupied() {
      return false;
    },
    is() {
      return false;
    },
    setDirection() {},
    emit() {},
    getStepDuration() {
      return BASE_STEP_DURATION;
    },
    getId() {
      return 7;
    },
    broadcast(packet) {
      movementPacket = packet;
    },
    actionHandler: {
      targetHandler: {
        hasTarget() {
          return false;
        },
      },
    },
  };

  handler.floorLava = { handleDestination: () => null };
  handler.bomberman = { handleDestination: () => null };
  handler.laserChairs = null;
  handler.partyGameFlow = null;
  handler.partyBouncers = null;

  handler.updateCreaturePosition = function (movingCreature, position) {
    movingCreature.position = position;
  };

  gameServer.world.getTileFromWorldPosition = function (position) {
    return position === origin ? originTile : destinationTile;
  };

  assert.strictEqual(handler.moveCreature(creature, destination), true);
  assert.ok(movementPacket, "A successful step must broadcast a movement packet.");

  const buffer = movementPacket.getBuffer();
  return buffer.readUInt16LE(buffer.length - 2);
}

function getClientPredictionDuration(destination) {
  const packetHandlerFile = path.join(
    __dirname,
    "..",
    "client",
    "src",
    "network",
    "packet-handler.js"
  );
  const context = vm.createContext({ console });

  vm.runInContext(
    fs.readFileSync(packetHandlerFile, "utf8") +
      "\nthis.PacketHandler = PacketHandler;",
    context,
    { filename: packetHandlerFile }
  );

  let predictedDuration = null;
  context.gameClient = {
    player: {
      id: 7,
      getPosition() {
        return origin;
      },
      getStepDuration(tile) {
        assert.strictEqual(tile, destinationTile);
        return BASE_STEP_DURATION;
      },
    },
    world: {
      handleCreatureMove(id, position, duration) {
        assert.strictEqual(id, 7);
        assert.strictEqual(position, destination);
        predictedDuration = duration;
        return true;
      },
    },
    interface: {
      setCancelMessage() {
        throw new Error("The test step must not be rejected client-side.");
      },
    },
  };

  const handler = Object.create(context.PacketHandler.prototype);
  handler.clientSideMoveCheck = function () {
    return false;
  };
  handler.getTileUppie = function () {
    return destinationTile;
  };

  assert.strictEqual(handler.handlePlayerMove(destination), true);
  return predictedDuration;
}

global.gameServer = process.gameServer = {
  world: {
    getTileFromWorldPosition() {
      return destinationTile;
    },
    creatureHandler: null,
    combatHandler: {
      getPvPManager() {
        return {
          isPzLocked() {
            return false;
          },
        };
      },
    },
  },
};

try {
  const actualDurations = {
    serverLock: {
      cardinal: getServerLockDuration(cardinalDestination),
      diagonal: getServerLockDuration(diagonalDestination),
    },
    serverPacket: {
      cardinal: getServerPacketDuration(cardinalDestination),
      diagonal: getServerPacketDuration(diagonalDestination),
    },
    clientPrediction: {
      cardinal: getClientPredictionDuration(cardinalDestination),
      diagonal: getClientPredictionDuration(diagonalDestination),
    },
  };

  assert.strictEqual(
    getRejectedServerLockDuration(diagonalDestination),
    BASE_STEP_DURATION,
    "a rejected diagonal attempt keeps only the normal anti-spam lock"
  );

  assert.deepStrictEqual(
    actualDurations,
    {
      serverLock: {
        cardinal: BASE_STEP_DURATION,
        diagonal: DIAGONAL_STEP_DURATION,
      },
      serverPacket: {
        cardinal: BASE_STEP_DURATION,
        diagonal: DIAGONAL_STEP_DURATION,
      },
      clientPrediction: {
        cardinal: BASE_STEP_DURATION,
        diagonal: DIAGONAL_STEP_DURATION,
      },
    },
    "Diagonal server locks, packets and client prediction must all use the same exact 3x duration."
  );

  console.log(
    "PASS: diagonal movement uses the same exact 3x duration for server locks, packets and client prediction."
  );
} finally {
  process.gameServer = originalProcessGameServer;
  global.gameServer = originalGlobalGameServer;
}
