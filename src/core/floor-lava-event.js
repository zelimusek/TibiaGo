"use strict";

const Position = requireModule("utils/position");

const FLOOR_LAVA_CONFIG = {
  floor: {
    from: { x: 32509, y: 32340, z: 7 },
    to: { x: 32521, y: 32352, z: 7 }
  },
  audience: [
    {
      from: { x: 32507, y: 32340, z: 7 },
      to: { x: 32507, y: 32346, z: 7 }
    },
    {
      from: { x: 32523, y: 32340, z: 7 },
      to: { x: 32523, y: 32346, z: 7 }
    }
  ],
  entranceBarrier: {
    itemId: 1498,
    pulseMs: 1000
  },
  countdownMs: 10000,
  warningMs: 1500,
  waveCooldownMs: 1500,
  lavaPulseMs: 500,
  lavaPulseCount: 16,
  safeTileRatioPerWave: 0.7
};

const FloorLavaEvent = function (creatureHandler, options) {

  options = options || {};
  this.__creatureHandler = creatureHandler;
  this.__state = null;
  this.__now = options.now || Date.now;
  this.__random = options.random || Math.random;

}

FloorLavaEvent.prototype.getConfig = function () {

  return FLOOR_LAVA_CONFIG;

}

FloorLavaEvent.prototype.isRunning = function () {

  return this.__state !== null;

}

FloorLavaEvent.prototype.__positionKey = function (position) {

  return "%s:%s:%s".format(position.x, position.y, position.z);

}

FloorLavaEvent.prototype.__isInsideArea = function (position, area) {

  if (!position || position.z !== area.from.z || position.z !== area.to.z) {
    return false;
  }

  return position.x >= Math.min(area.from.x, area.to.x)
    && position.x <= Math.max(area.from.x, area.to.x)
    && position.y >= Math.min(area.from.y, area.to.y)
    && position.y <= Math.max(area.from.y, area.to.y);

}

FloorLavaEvent.prototype.isOnFloor = function (position) {

  return this.__isInsideArea(position, FLOOR_LAVA_CONFIG.floor);

}

FloorLavaEvent.prototype.__getPlayerName = function (player) {

  if (player && typeof player.getProperty === "function") {
    return player.getProperty(CONST.PROPERTIES.NAME);
  }

  return player ? player.name : null;

}

FloorLavaEvent.prototype.__getAreaPositions = function (area) {

  let positions = [];
  let minX = Math.min(area.from.x, area.to.x);
  let maxX = Math.max(area.from.x, area.to.x);
  let minY = Math.min(area.from.y, area.to.y);
  let maxY = Math.max(area.from.y, area.to.y);

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      positions.push(new Position(x, y, area.from.z));
    }
  }

  return positions;

}

FloorLavaEvent.prototype.__getEntranceBarrierPositions = function () {

  let floor = FLOOR_LAVA_CONFIG.floor;
  let z = floor.from.z;
  let minX = Math.min(floor.from.x, floor.to.x) - 1;
  let maxX = Math.max(floor.from.x, floor.to.x) + 1;
  let minY = Math.min(floor.from.y, floor.to.y) - 1;
  let maxY = Math.max(floor.from.y, floor.to.y) + 1;
  let positions = [];

  for (let x = minX + 1; x <= maxX - 1; x++) {
    positions.push(new Position(x, minY, z));
    positions.push(new Position(x, maxY, z));
  }

  for (let y = minY + 1; y <= maxY - 1; y++) {
    positions.push(new Position(minX, y, z));
    positions.push(new Position(maxX, y, z));
  }

  return positions;

}

FloorLavaEvent.prototype.__shuffle = function (values) {

  let shuffled = values.slice();

  for (let index = shuffled.length - 1; index > 0; index--) {
    let other = Math.floor(this.__random() * (index + 1));
    let temporary = shuffled[index];
    shuffled[index] = shuffled[other];
    shuffled[other] = temporary;
  }

  return shuffled;

}

FloorLavaEvent.prototype.__isWalkableTile = function (position) {

  let tile = gameServer.world.getTileFromWorldPosition(position);
  return tile !== null && tile.id !== 0 && !tile.isOccupied();

}

FloorLavaEvent.prototype.__isFreeTile = function (position) {

  let tile = gameServer.world.getTileFromWorldPosition(position);

  if (tile === null || tile.id === 0 || tile.isOccupied()) {
    return false;
  }

  return typeof tile.isOccupiedCharacters !== "function"
    || !tile.isOccupiedCharacters();

}

FloorLavaEvent.prototype.__getPlayableFloorTiles = function () {

  return this.__getAreaPositions(FLOOR_LAVA_CONFIG.floor).filter(function (position) {
    return this.__isWalkableTile(position);
  }, this);

}

FloorLavaEvent.prototype.__getAudiencePosition = function () {

  // Prefer a free tile in the primary audience strip. The second strip is a
  // true overflow area and is only considered when the first one is full.
  for (let areaIndex = 0; areaIndex < FLOOR_LAVA_CONFIG.audience.length; areaIndex++) {
    let freePositions = this.__shuffle(
      this.__getAreaPositions(FLOOR_LAVA_CONFIG.audience[areaIndex])
    ).filter(function (position) {
      return this.__isFreeTile(position);
    }, this);

    if (freePositions.length > 0) {
      return freePositions[0];
    }
  }

  // If both strips are full, stacking on a walkable audience tile is safer
  // than leaving an eliminated player on the active lava floor.
  for (let fallbackIndex = FLOOR_LAVA_CONFIG.audience.length - 1; fallbackIndex >= 0; fallbackIndex--) {
    let walkablePositions = this.__shuffle(
      this.__getAreaPositions(FLOOR_LAVA_CONFIG.audience[fallbackIndex])
    ).filter(function (position) {
      return this.__isWalkableTile(position);
    }, this);

    if (walkablePositions.length > 0) {
      return walkablePositions[0];
    }
  }

  return null;

}

FloorLavaEvent.prototype.__broadcast = function (message) {

  this.__creatureHandler.getConnectedPlayers().forEach(function (player) {
    player.sendCancelMessage(message);
  });

}

FloorLavaEvent.prototype.start = function () {

  if (this.__state !== null) {
    return { ok: false, message: "A Floor is Lava round is already running." };
  }

  if (
    this.__creatureHandler.bomberman
    && this.__creatureHandler.bomberman.isRunning()
  ) {
    return { ok: false, message: "Stop Bomberman before starting Floor is Lava." };
  }

  let playableTiles = this.__getPlayableFloorTiles();

  if (playableTiles.length < 2) {
    return { ok: false, message: "The dance floor does not contain enough walkable tiles." };
  }

  if (this.__getAudiencePosition() === null) {
    return { ok: false, message: "Neither audience strip contains a walkable tile." };
  }

  let participants = new Set();
  this.__creatureHandler.getConnectedPlayers().forEach(function (player) {
    if (this.isOnFloor(player.position)) {
      participants.add(this.__getPlayerName(player));
    }
  }, this);

  if (participants.size === 0) {
    return { ok: false, message: "There are no players on the dance floor." };
  }

  let now = this.__now();
  this.__state = {
    phase: "countdown",
    participants: participants,
    eliminated: new Set(),
    playableTiles: playableTiles,
    lava: new Set(),
    warned: new Map(),
    entranceBarrierItems: new Map(),
    startsAt: now + FLOOR_LAVA_CONFIG.countdownMs,
    nextWaveAt: null,
    warningActivatesAt: null,
    lastCountdownSecond: 10,
    lastLavaPulseAt: 0,
    lastEntranceBarrierPulseAt: 0,
    wave: 0
  };

  this.__closeEntranceBarrier();

  this.__broadcast(
    "Floor is Lava starts in 10 seconds! %s player%s locked in. Stay on the dance floor."
      .format(participants.size, participants.size === 1 ? "" : "s")
  );

  return { ok: true, message: "Floor is Lava countdown started." };

}

FloorLavaEvent.prototype.stop = function (reason) {

  if (this.__state === null) {
    return { ok: false, message: "No Floor is Lava round is running." };
  }

  this.__openEntranceBarrier();
  this.__state = null;
  this.__broadcast(reason || "Floor is Lava was stopped by a game master.");
  return { ok: true, message: "Floor is Lava stopped." };

}

FloorLavaEvent.prototype.getStatus = function () {

  if (this.__state === null) {
    return "Floor is Lava is not running.";
  }

  let survivors = this.__getSurvivorNames();
  return "Floor is Lava: %s, wave %s, %s/%s players still in."
    .format(
      this.__state.phase,
      this.__state.wave,
      survivors.length,
      this.__state.participants.size
    );

}

FloorLavaEvent.prototype.__getConnectedPlayer = function (name) {

  let match = null;
  this.__creatureHandler.getConnectedPlayers().forEach(function (player) {
    if (this.__getPlayerName(player) === name) {
      match = player;
    }
  }, this);
  return match;

}

FloorLavaEvent.prototype.__getSurvivorNames = function () {

  if (this.__state === null) {
    return [];
  }

  return Array.from(this.__state.participants).filter(function (name) {
    return !this.__state.eliminated.has(name);
  }, this);

}

FloorLavaEvent.prototype.__eliminate = function (player, reason) {

  if (this.__state === null) {
    return;
  }

  let name = this.__getPlayerName(player);

  if (!this.__state.participants.has(name) || this.__state.eliminated.has(name)) {
    return;
  }

  this.__state.eliminated.add(name);
  gameServer.world.sendMagicEffect(player.position, CONST.EFFECT.MAGIC.HITBYFIRE);
  this.__broadcast("%s is out%s".format(name, reason ? " — " + reason + "!" : "!"));

}

FloorLavaEvent.prototype.handleDestination = function (player, position) {

  if (this.__state === null || !player || !position) {
    return null;
  }

  let name = this.__getPlayerName(player);
  let isParticipant = this.__state.participants.has(name);
  let isEliminated = this.__state.eliminated.has(name);
  let destinationOnFloor = this.isOnFloor(position);

  if (!isParticipant || isEliminated) {
    if (!destinationOnFloor) {
      return null;
    }

    player.sendCancelMessage(
      isEliminated
        ? "You are out. Wait for the next Floor is Lava round."
        : "A Floor is Lava round is already running."
    );

    return {
      position: this.__getAudiencePosition(),
      eliminated: isEliminated
    };
  }

  if (!destinationOnFloor) {
    this.__eliminate(player, "left the dance floor");
    return {
      position: this.__getAudiencePosition(),
      eliminated: true
    };
  }

  let destinationKey = this.__positionKey(position);
  if (this.__state.phase === "active" && this.__state.lava.has(destinationKey)) {
    this.__eliminate(player, "touched lava");
    return {
      position: this.__getAudiencePosition(),
      eliminated: true
    };
  }

  return null;

}

FloorLavaEvent.prototype.handlePlayerConnected = function (player) {

  if (this.__state === null || !this.isOnFloor(player.position)) {
    return null;
  }

  let name = this.__getPlayerName(player);

  if (this.__state.participants.has(name) && !this.__state.eliminated.has(name)) {
    return null;
  }

  player.sendCancelMessage("A Floor is Lava round is already running. You are spectating.");
  return this.__getAudiencePosition();

}

FloorLavaEvent.prototype.__eliminateInvalidSurvivors = function () {

  this.__getSurvivorNames().forEach(function (name) {
    let player = this.__getConnectedPlayer(name);

    if (player === null) {
      this.__state.eliminated.add(name);
      return;
    }

    if (!this.isOnFloor(player.position)) {
      this.__eliminate(player, "left the dance floor");
      return;
    }

    if (
      this.__state.phase === "active"
      && this.__state.lava.has(this.__positionKey(player.position))
    ) {
      this.__eliminate(player, "touched lava");
      let audiencePosition = this.__getAudiencePosition();
      if (audiencePosition !== null) {
        this.__creatureHandler.teleportCreature(
          player,
          audiencePosition,
          { ignoreFloorLava: true }
        );
      }
    }
  }, this);

}

FloorLavaEvent.prototype.__finishIfResolved = function () {

  let survivors = this.__getSurvivorNames();

  if (survivors.length > 1) {
    return false;
  }

  this.__openEntranceBarrier();
  this.__state = null;

  if (survivors.length === 0) {
    this.__broadcast("Floor is Lava is over — the lava wins!");
    return true;
  }

  let winner = this.__getConnectedPlayer(survivors[0]);

  if (winner !== null) {
    if (this.__creatureHandler.partyAchievements) {
      this.__creatureHandler.partyAchievements.recordLavaWin(winner);
    }
    if (typeof this.__creatureHandler.focusSpotlightsOnPlayer === "function") {
      this.__creatureHandler.focusSpotlightsOnPlayer(winner);
    }
    gameServer.world.sendMagicEffect(winner.position, CONST.EFFECT.MAGIC.SOUND_WHITE);
  }

  this.__broadcast("%s wins Floor is Lava!".format(survivors[0]));
  if (typeof this.__creatureHandler.announceNpcYell === "function") {
    this.__creatureHandler.announceNpcYell(
      "DJ Thomas",
      "%s wins Floor is Lava!".format(survivors[0])
    );
  }
  return true;

}

FloorLavaEvent.prototype.__warnNextWave = function (now) {

  let safeTiles = this.__state.playableTiles.filter(function (position) {
    return !this.__state.lava.has(this.__positionKey(position));
  }, this);

  if (safeTiles.length <= 1) {
    return;
  }

  let targetSafeCount = Math.max(
    1,
    Math.floor(safeTiles.length * FLOOR_LAVA_CONFIG.safeTileRatioPerWave)
  );
  let warningCount = safeTiles.length - targetSafeCount;
  let warnedTiles = this.__shuffle(safeTiles).slice(0, warningCount);

  this.__state.warned = new Map();
  warnedTiles.forEach(function (position) {
    this.__state.warned.set(this.__positionKey(position), position);
    gameServer.world.sendMagicEffect(position, CONST.EFFECT.MAGIC.SOUND_YELLOW);
  }, this);

  this.__state.warningActivatesAt = now + FLOOR_LAVA_CONFIG.warningMs;
  this.__state.wave++;
  this.__broadcast(
    "Lava wave %s incoming! Move away from the yellow warning tiles."
      .format(this.__state.wave)
  );

}

FloorLavaEvent.prototype.__activateWarnedTiles = function (now) {

  this.__state.warned.forEach(function (position, key) {
    this.__state.lava.add(key);
    gameServer.world.sendMagicEffect(position, CONST.EFFECT.MAGIC.FIREAREA);
  }, this);

  this.__state.warned = new Map();
  this.__state.warningActivatesAt = null;
  this.__state.nextWaveAt = now + FLOOR_LAVA_CONFIG.waveCooldownMs;
  this.__eliminateInvalidSurvivors();

}

FloorLavaEvent.prototype.__pulseLava = function (now) {

  if (
    this.__state.lava.size === 0
    || now - this.__state.lastLavaPulseAt < FLOOR_LAVA_CONFIG.lavaPulseMs
  ) {
    return;
  }

  this.__state.lastLavaPulseAt = now;
  let lavaPositions = this.__state.playableTiles.filter(function (position) {
    return this.__state.lava.has(this.__positionKey(position));
  }, this);

  this.__shuffle(lavaPositions)
    .slice(0, FLOOR_LAVA_CONFIG.lavaPulseCount)
    .forEach(function (position) {
      gameServer.world.sendMagicEffect(position, CONST.EFFECT.MAGIC.FIREAREA);
    });

}

FloorLavaEvent.prototype.__closeEntranceBarrier = function () {

  if (this.__state === null) {
    return;
  }

  this.__getEntranceBarrierPositions().forEach(function (position) {
    let tile = gameServer.world.getTileFromWorldPosition(position);

    if (tile === null || tile.id === 0) {
      return;
    }

    let wall = gameServer.database.createThing(FLOOR_LAVA_CONFIG.entranceBarrier.itemId);

    if (wall !== null && typeof tile.addTopThing === "function") {
      tile.addTopThing(wall);
      this.__state.entranceBarrierItems.set(this.__positionKey(position), {
        position: position,
        wall: wall
      });
    }

    gameServer.world.sendMagicEffect(position, CONST.EFFECT.MAGIC.MAGIC_BLUE);
  }, this);

}

FloorLavaEvent.prototype.__openEntranceBarrier = function () {

  if (this.__state === null) {
    return;
  }

  this.__state.entranceBarrierItems.forEach(function (entry) {
    let tile = gameServer.world.getTileFromWorldPosition(entry.position);

    if (tile !== null && typeof tile.deleteThing === "function") {
      tile.deleteThing(entry.wall);
    }

    gameServer.world.sendMagicEffect(entry.position, CONST.EFFECT.MAGIC.POFF);
  });

  this.__state.entranceBarrierItems.clear();

}

FloorLavaEvent.prototype.__pulseEntranceBarrier = function (now) {

  if (
    this.__state === null
    || now - this.__state.lastEntranceBarrierPulseAt < FLOOR_LAVA_CONFIG.entranceBarrier.pulseMs
  ) {
    return;
  }

  this.__state.lastEntranceBarrierPulseAt = now;

  this.__getEntranceBarrierPositions().forEach(function (position, index) {
    let effect = index % 2 === 0
      ? CONST.EFFECT.MAGIC.ENERGYHIT
      : CONST.EFFECT.MAGIC.MAGIC_BLUE;

    gameServer.world.sendMagicEffect(position, effect);
  });

}

FloorLavaEvent.prototype.tick = function () {

  if (this.__state === null) {
    return;
  }

  let now = this.__now();
  this.__pulseEntranceBarrier(now);
  this.__eliminateInvalidSurvivors();

  if (this.__state.phase === "countdown") {
    let seconds = Math.max(0, Math.ceil((this.__state.startsAt - now) / 1000));

    if (
      seconds !== this.__state.lastCountdownSecond
      && [5, 3, 2, 1].includes(seconds)
    ) {
      this.__state.lastCountdownSecond = seconds;
      this.__broadcast("Floor is Lava begins in %s...".format(seconds));
    }

    if (now < this.__state.startsAt) {
      return;
    }

    this.__state.phase = "active";
    this.__state.nextWaveAt = now;
    this.__broadcast("GO! The floor is now turning into lava!");
  }

  if (this.__finishIfResolved()) {
    return;
  }

  if (
    this.__state.warningActivatesAt !== null
    && now >= this.__state.warningActivatesAt
  ) {
    this.__activateWarnedTiles(now);

    if (this.__finishIfResolved()) {
      return;
    }
  }

  if (
    this.__state.warningActivatesAt === null
    && now >= this.__state.nextWaveAt
  ) {
    this.__warnNextWave(now);
  }

  this.__pulseLava(now);

}

module.exports = FloorLavaEvent;
