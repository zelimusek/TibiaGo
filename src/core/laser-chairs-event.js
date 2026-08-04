"use strict";

const Position = requireModule("utils/position");

const LASER_CHAIRS_CONFIG = {
  floor: {
    from: { x: 32509, y: 32340, z: 7 },
    to: { x: 32521, y: 32352, z: 7 }
  },
  audience: [
    { from: { x: 32507, y: 32340, z: 7 }, to: { x: 32507, y: 32346, z: 7 } },
    { from: { x: 32523, y: 32340, z: 7 }, to: { x: 32523, y: 32346, z: 7 } }
  ],
  countdownMs: 5000,
  danceMinMs: 4000,
  danceMaxMs: 7000,
  claimMs: 7000,
  laserApproachMs: 700,
  laserDrawBaseMs: 1600,
  laserDrawBatchMs: 800,
  laserCount: 9,
  resultMs: 1500
};

const LaserChairsEvent = function (creatureHandler, options) {
  options = options || {};
  this.__creatureHandler = creatureHandler;
  this.__state = null;
  this.__now = options.now || Date.now;
  this.__random = options.random || Math.random;
};

LaserChairsEvent.prototype.getConfig = function () {
  return LASER_CHAIRS_CONFIG;
};

LaserChairsEvent.prototype.isRunning = function () {
  return this.__state !== null;
};

LaserChairsEvent.prototype.__positionKey = function (position) {
  return "%s:%s:%s".format(position.x, position.y, position.z);
};

LaserChairsEvent.prototype.__isInsideArea = function (position, area) {
  return Boolean(position)
    && position.z === area.from.z
    && position.x >= Math.min(area.from.x, area.to.x)
    && position.x <= Math.max(area.from.x, area.to.x)
    && position.y >= Math.min(area.from.y, area.to.y)
    && position.y <= Math.max(area.from.y, area.to.y);
};

LaserChairsEvent.prototype.isOnFloor = function (position) {
  return this.__isInsideArea(position, LASER_CHAIRS_CONFIG.floor);
};

LaserChairsEvent.prototype.__getPlayerName = function (player) {
  return player && typeof player.getProperty === "function"
    ? player.getProperty(CONST.PROPERTIES.NAME)
    : (player ? player.name : null);
};

LaserChairsEvent.prototype.__getAreaPositions = function (area) {
  let positions = [];
  for (let x = Math.min(area.from.x, area.to.x); x <= Math.max(area.from.x, area.to.x); x++) {
    for (let y = Math.min(area.from.y, area.to.y); y <= Math.max(area.from.y, area.to.y); y++) {
      positions.push(new Position(x, y, area.from.z));
    }
  }
  return positions;
};

LaserChairsEvent.prototype.__shuffle = function (values) {
  let shuffled = values.slice();
  for (let index = shuffled.length - 1; index > 0; index--) {
    let other = Math.floor(this.__random() * (index + 1));
    let temporary = shuffled[index];
    shuffled[index] = shuffled[other];
    shuffled[other] = temporary;
  }
  return shuffled;
};

LaserChairsEvent.prototype.__isWalkableTile = function (position) {
  let tile = gameServer.world.getTileFromWorldPosition(position);
  return tile !== null && tile.id !== 0 && !tile.isOccupied();
};

LaserChairsEvent.prototype.__isFreeTile = function (position) {
  let tile = gameServer.world.getTileFromWorldPosition(position);
  return tile !== null
    && tile.id !== 0
    && !tile.isOccupied()
    && (typeof tile.isOccupiedCharacters !== "function" || !tile.isOccupiedCharacters());
};

LaserChairsEvent.prototype.__getAudiencePosition = function () {
  for (let index = 0; index < LASER_CHAIRS_CONFIG.audience.length; index++) {
    let free = this.__shuffle(this.__getAreaPositions(LASER_CHAIRS_CONFIG.audience[index]))
      .find(this.__isFreeTile.bind(this));
    if (free) return free;
  }
  for (let index = LASER_CHAIRS_CONFIG.audience.length - 1; index >= 0; index--) {
    let fallback = this.__shuffle(this.__getAreaPositions(LASER_CHAIRS_CONFIG.audience[index]))
      .find(this.__isWalkableTile.bind(this));
    if (fallback) return fallback;
  }
  return null;
};

LaserChairsEvent.prototype.__getConnectedPlayer = function (name) {
  let match = null;
  this.__creatureHandler.getConnectedPlayers().forEach(function (player) {
    if (this.__getPlayerName(player) === name) match = player;
  }, this);
  return match;
};

LaserChairsEvent.prototype.__getSurvivorNames = function () {
  if (!this.__state) return [];
  return Array.from(this.__state.participants).filter(function (name) {
    return !this.__state.eliminated.has(name);
  }, this);
};

LaserChairsEvent.prototype.__broadcast = function (message) {
  this.__creatureHandler.getConnectedPlayers().forEach(function (player) {
    if (!this.__creatureHandler.isInsidePartyRadioZone
        || this.__creatureHandler.isInsidePartyRadioZone(player.position)) {
      player.sendCancelMessage(message);
    }
  }, this);
};

LaserChairsEvent.prototype.__sync = function () {
  if (typeof this.__creatureHandler.__resyncRadioAmbience === "function") {
    this.__creatureHandler.__resyncRadioAmbience();
  }
};

LaserChairsEvent.prototype.__setPhase = function (phase, durationMs) {
  let now = this.__now();
  this.__state.phase = phase;
  this.__state.phaseStartedAt = now;
  this.__state.phaseEndsAt = now + durationMs;
  this.__sync();
};

LaserChairsEvent.prototype.start = function () {
  if (this.__state) return { ok: false, message: "Laser Chairs is already running." };
  if (this.__creatureHandler.floorLava && this.__creatureHandler.floorLava.isRunning()) {
    return { ok: false, message: "Stop Floor is Lava before starting Laser Chairs." };
  }
  if (this.__creatureHandler.bomberman && this.__creatureHandler.bomberman.isRunning()) {
    return { ok: false, message: "Stop Bomberman before starting Laser Chairs." };
  }
  if (this.__getAudiencePosition() === null) {
    return { ok: false, message: "Neither audience strip contains a walkable tile." };
  }

  let participants = new Set();
  this.__creatureHandler.getConnectedPlayers().forEach(function (player) {
    if (this.isOnFloor(player.position)) participants.add(this.__getPlayerName(player));
  }, this);
  if (participants.size < 2) {
    return { ok: false, message: "At least two players must stand on the dance floor." };
  }

  let now = this.__now();
  this.__state = {
    phase: "countdown",
    phaseStartedAt: now,
    phaseEndsAt: now + LASER_CHAIRS_CONFIG.countdownMs,
    participants: participants,
    eliminated: new Set(),
    squares: new Map(),
    round: 0,
    repeatRound: false,
    lastCountdownSecond: 5
  };
  this.__sync();
  this.__broadcast("Laser Chairs starts in 5 seconds! %s players locked in.".format(participants.size));
  return { ok: true, message: "Laser Chairs countdown started." };
};

LaserChairsEvent.prototype.stop = function (reason) {
  if (!this.__state) return { ok: false, message: "Laser Chairs is not running." };
  this.__state = null;
  this.__sync();
  this.__broadcast(reason || "Laser Chairs was stopped by a game master.");
  return { ok: true, message: "Laser Chairs stopped." };
};

LaserChairsEvent.prototype.getStatus = function () {
  if (!this.__state) return "Laser Chairs is not running.";
  return "Laser Chairs: %s, round %s, %s/%s players remain."
    .format(this.__state.phase, this.__state.round, this.__getSurvivorNames().length, this.__state.participants.size);
};

LaserChairsEvent.prototype.__getSquareDrawDurationMs = function (squareCount) {
  let extraBatches = Math.ceil(Math.max(0, squareCount - LASER_CHAIRS_CONFIG.laserCount)
    / LASER_CHAIRS_CONFIG.laserCount);
  return LASER_CHAIRS_CONFIG.laserDrawBaseMs
    + extraBatches * LASER_CHAIRS_CONFIG.laserDrawBatchMs;
};

LaserChairsEvent.prototype.getPayload = function () {
  if (!this.__state) return null;
  let now = this.__now();
  return {
    phase: this.__state.phase,
    elapsedMs: Math.max(0, now - this.__state.phaseStartedAt),
    durationMs: Math.max(1, this.__state.phaseEndsAt - this.__state.phaseStartedAt),
    drawDurationMs: this.__state.squareDrawDurationMs || LASER_CHAIRS_CONFIG.laserDrawBaseMs,
    round: this.__state.round,
    remaining: this.__getSurvivorNames().length,
    floor: LASER_CHAIRS_CONFIG.floor,
    squares: Array.from(this.__state.squares.values()).map(function (position) {
      return { x: position.x, y: position.y, z: position.z };
    })
  };
};

LaserChairsEvent.prototype.__startDance = function () {
  this.__state.squares.clear();
  let duration = LASER_CHAIRS_CONFIG.danceMinMs
    + Math.floor(this.__random() * (LASER_CHAIRS_CONFIG.danceMaxMs - LASER_CHAIRS_CONFIG.danceMinMs + 1));
  this.__setPhase("dancing", duration);
  this.__broadcast("Dance!");
};

LaserChairsEvent.prototype.__chooseSquares = function (amount) {
  let occupied = new Set();
  this.__getSurvivorNames().forEach(function (name) {
    let player = this.__getConnectedPlayer(name);
    if (player) occupied.add(this.__positionKey(player.position));
  }, this);
  let positions = this.__getAreaPositions(LASER_CHAIRS_CONFIG.floor).filter(function (position) {
    let tile = gameServer.world.getTileFromWorldPosition(position);
    return tile !== null && tile.id !== 0 && !tile.isOccupied();
  });
  let preferred = this.__shuffle(positions.filter(function (position) {
    return !occupied.has(this.__positionKey(position));
  }, this));
  let fallback = this.__shuffle(positions.filter(function (position) {
    return occupied.has(this.__positionKey(position));
  }, this));
  return preferred.concat(fallback).slice(0, amount);
};

LaserChairsEvent.prototype.__startClaim = function () {
  let survivors = this.__getSurvivorNames();
  let squares = this.__chooseSquares(Math.max(1, survivors.length - 1));
  if (squares.length < Math.max(1, survivors.length - 1)) {
    return this.stop("Laser Chairs stopped because the floor has too few free SQMs.");
  }
  this.__state.squares = new Map();
  squares.forEach(function (position) {
    this.__state.squares.set(this.__positionKey(position), position);
  }, this);
  if (!this.__state.repeatRound) this.__state.round++;
  this.__state.repeatRound = false;
  this.__state.squareDrawDurationMs = this.__getSquareDrawDurationMs(squares.length);
  this.__setPhase("claiming", LASER_CHAIRS_CONFIG.laserApproachMs
    + this.__state.squareDrawDurationMs
    + LASER_CHAIRS_CONFIG.claimMs);
  this.__broadcast("Find your square!");
};

LaserChairsEvent.prototype.__occupiedSquareCount = function () {
  let occupied = new Set();
  this.__getSurvivorNames().forEach(function (name) {
    let player = this.__getConnectedPlayer(name);
    if (player && this.__state.squares.has(this.__positionKey(player.position))) {
      occupied.add(this.__positionKey(player.position));
    }
  }, this);
  return occupied.size;
};

LaserChairsEvent.prototype.__eliminate = function (player) {
  let name = this.__getPlayerName(player);
  if (!this.__state.participants.has(name) || this.__state.eliminated.has(name)) return;
  this.__state.eliminated.add(name);
  gameServer.world.sendMagicEffect(player.position, CONST.EFFECT.MAGIC.POFF);
  let audience = this.__getAudiencePosition();
  if (audience) {
    this.__creatureHandler.teleportCreature(player, audience, { ignoreLaserChairs: true });
  }
};

LaserChairsEvent.prototype.__resolveClaim = function () {
  let seated = [];
  this.__getSurvivorNames().forEach(function (name) {
    let player = this.__getConnectedPlayer(name);
    if (player && this.__state.squares.has(this.__positionKey(player.position))) seated.push(player);
  }, this);

  if (seated.length === 0) {
    this.__broadcast("Nobody found a square — this round will be repeated!");
    this.__setPhase("result", LASER_CHAIRS_CONFIG.resultMs);
    this.__state.repeatRound = true;
    return;
  }

  this.__getSurvivorNames().forEach(function (name) {
    let player = this.__getConnectedPlayer(name);
    if (!player || !this.__state.squares.has(this.__positionKey(player.position))) {
      if (player) this.__eliminate(player);
      else this.__state.eliminated.add(name);
    }
  }, this);
  let remaining = this.__getSurvivorNames().length;
  if (remaining <= 1) {
    this.__finish();
    return;
  }
  this.__broadcast("%s players remain!".format(remaining));
  this.__state.repeatRound = false;
  this.__setPhase("result", LASER_CHAIRS_CONFIG.resultMs);
};

LaserChairsEvent.prototype.__finish = function () {
  let survivors = this.__getSurvivorNames();
  let winnerName = survivors.length === 1 ? survivors[0] : null;
  let winner = winnerName ? this.__getConnectedPlayer(winnerName) : null;
  this.__state = null;
  this.__sync();
  if (!winnerName) {
    this.__broadcast("Laser Chairs ended without a winner.");
    return;
  }
  if (winner && typeof this.__creatureHandler.celebratePartyWinner === "function") {
    this.__creatureHandler.celebratePartyWinner(winner);
    gameServer.world.sendMagicEffect(winner.position, CONST.EFFECT.MAGIC.SOUND_WHITE);
  }
  this.__broadcast("%s wins Laser Chairs!".format(winnerName));
  if (typeof this.__creatureHandler.announceNpcYell === "function") {
    this.__creatureHandler.announceNpcYell("DJ Thomas", "%s wins Laser Chairs!".format(winnerName));
  }
};

LaserChairsEvent.prototype.handleDestination = function (player, position) {
  if (!this.__state || !player || !position) return null;
  let name = this.__getPlayerName(player);
  let participant = this.__state.participants.has(name) && !this.__state.eliminated.has(name);
  let destinationOnFloor = this.isOnFloor(position);
  if (!participant && destinationOnFloor) {
    player.sendCancelMessage("Laser Chairs is running. Wait for the next game.");
    return { position: this.__getAudiencePosition() };
  }
  if (participant && !destinationOnFloor) {
    player.sendCancelMessage("You cannot leave the dance floor during Laser Chairs.");
    return { position: null };
  }
  return null;
};

LaserChairsEvent.prototype.handlePlayerConnected = function (player) {
  if (!this.__state || !this.isOnFloor(player.position)) return null;
  let name = this.__getPlayerName(player);
  if (this.__state.participants.has(name) && !this.__state.eliminated.has(name)) return null;
  player.sendCancelMessage("Laser Chairs is running. You are spectating.");
  return this.__getAudiencePosition();
};

LaserChairsEvent.prototype.__removeDisconnected = function () {
  this.__getSurvivorNames().forEach(function (name) {
    let player = this.__getConnectedPlayer(name);
    if (!player || !this.isOnFloor(player.position)) this.__state.eliminated.add(name);
  }, this);
};

LaserChairsEvent.prototype.tick = function () {
  if (!this.__state) return;
  let now = this.__now();
  this.__removeDisconnected();
  if (this.__getSurvivorNames().length <= 1) return this.__finish();

  if (this.__state.phase === "countdown") {
    let seconds = Math.max(0, Math.ceil((this.__state.phaseEndsAt - now) / 1000));
    if (seconds !== this.__state.lastCountdownSecond && [3, 2, 1].includes(seconds)) {
      this.__state.lastCountdownSecond = seconds;
      this.__broadcast("Laser Chairs begins in %s...".format(seconds));
    }
    if (now >= this.__state.phaseEndsAt) this.__startDance();
    return;
  }
  if (this.__state.phase === "dancing" && now >= this.__state.phaseEndsAt) {
    this.__startClaim();
    return;
  }
  if (this.__state.phase === "claiming") {
    if (this.__occupiedSquareCount() >= this.__state.squares.size || now >= this.__state.phaseEndsAt) {
      this.__resolveClaim();
    }
    return;
  }
  if (this.__state.phase === "result" && now >= this.__state.phaseEndsAt) {
    this.__startDance();
  }
};

module.exports = LaserChairsEvent;
