"use strict";

const Position = requireModule("utils/position");
const Condition = requireModule("combat/condition");

const BOMBERMAN_CONFIG = {
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
  countdownMs: 5000,
  mayhemRoundMs: 180000,
  eliminationRoundMs: 180000,
  fuseMs: 3000,
  initialBlastRange: 2,
  maximumBlastRange: 6,
  initialMaximumBombs: 1,
  maximumBombs: 4,
  respawnProtectionMs: 2000,
  hasteTicks: 20,
  hasteTickMs: 500,
  hasteBonusFactor: 1.5,
  bombPulseMs: 500,
  powerUpPulseMs: 700,
  shieldPulseMs: 700,
  barrierPulseMs: 1000,
  powerUpDropChance: 0.55,
  minimumBombPowerUps: 8,
  bombItemId: 2109,
  borderWallItemId: 1497,
  crateItemId: 1740
};

const POWER_UPS = {
  bomb: {
    label: "+1 active bomb",
    effect: () => CONST.EFFECT.MAGIC.ENERGYHIT
  },
  range: {
    label: "+1 explosion range",
    effect: () => CONST.EFFECT.MAGIC.FIREAREA
  },
  speed: {
    label: "10 seconds of speed",
    effect: () => CONST.EFFECT.MAGIC.MAGIC_GREEN
  },
  shield: {
    label: "one-hit shield",
    effect: () => CONST.EFFECT.MAGIC.MAGIC_BLUE
  }
};

const BombermanEvent = function (creatureHandler, options) {

  options = options || {};
  this.__creatureHandler = creatureHandler;
  this.__state = null;
  this.__now = options.now || Date.now;
  this.__random = options.random || Math.random;

}

BombermanEvent.prototype.getConfig = function () {

  return BOMBERMAN_CONFIG;

}

BombermanEvent.prototype.isRunning = function () {

  return this.__state !== null;

}

BombermanEvent.prototype.__positionKey = function (position) {

  return "%s:%s:%s".format(position.x, position.y, position.z);

}

BombermanEvent.prototype.__isInsideArea = function (position, area) {

  if (!position || position.z !== area.from.z || position.z !== area.to.z) {
    return false;
  }

  return position.x >= Math.min(area.from.x, area.to.x)
    && position.x <= Math.max(area.from.x, area.to.x)
    && position.y >= Math.min(area.from.y, area.to.y)
    && position.y <= Math.max(area.from.y, area.to.y);

}

BombermanEvent.prototype.isOnFloor = function (position) {

  return this.__isInsideArea(position, BOMBERMAN_CONFIG.floor);

}

BombermanEvent.prototype.__getPlayerName = function (player) {

  if (player && typeof player.getProperty === "function") {
    return player.getProperty(CONST.PROPERTIES.NAME);
  }

  return player ? player.name : null;

}

BombermanEvent.prototype.__getAreaPositions = function (area) {

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

BombermanEvent.prototype.__shuffle = function (values) {

  let shuffled = values.slice();

  for (let index = shuffled.length - 1; index > 0; index--) {
    let other = Math.floor(this.__random() * (index + 1));
    let temporary = shuffled[index];
    shuffled[index] = shuffled[other];
    shuffled[other] = temporary;
  }

  return shuffled;

}

BombermanEvent.prototype.__isWalkableTile = function (position) {

  let tile = gameServer.world.getTileFromWorldPosition(position);
  return tile !== null && tile.id !== 0 && !tile.isOccupied();

}

BombermanEvent.prototype.__isFreeTile = function (position) {

  let tile = gameServer.world.getTileFromWorldPosition(position);

  if (tile === null || tile.id === 0 || tile.isOccupied()) {
    return false;
  }

  return typeof tile.isOccupiedCharacters !== "function"
    || !tile.isOccupiedCharacters();

}

BombermanEvent.prototype.__getAudiencePosition = function () {

  for (let areaIndex = 0; areaIndex < BOMBERMAN_CONFIG.audience.length; areaIndex++) {
    let freePositions = this.__shuffle(
      this.__getAreaPositions(BOMBERMAN_CONFIG.audience[areaIndex])
    ).filter(function (position) {
      return this.__isFreeTile(position);
    }, this);

    if (freePositions.length > 0) {
      return freePositions[0];
    }
  }

  for (let fallbackIndex = BOMBERMAN_CONFIG.audience.length - 1; fallbackIndex >= 0; fallbackIndex--) {
    let walkablePositions = this.__shuffle(
      this.__getAreaPositions(BOMBERMAN_CONFIG.audience[fallbackIndex])
    ).filter(function (position) {
      return this.__isWalkableTile(position);
    }, this);

    if (walkablePositions.length > 0) {
      return walkablePositions[0];
    }
  }

  return null;

}

BombermanEvent.prototype.__getBorderPositions = function () {

  let floor = BOMBERMAN_CONFIG.floor;
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

BombermanEvent.prototype.__getCratePositions = function () {

  let floor = BOMBERMAN_CONFIG.floor;
  let minX = Math.min(floor.from.x, floor.to.x);
  let maxX = Math.max(floor.from.x, floor.to.x);
  let minY = Math.min(floor.from.y, floor.to.y);
  let maxY = Math.max(floor.from.y, floor.to.y);
  let positions = [];

  for (let x = minX + 1; x < maxX; x += 2) {
    for (let y = minY + 1; y < maxY; y += 2) {
      positions.push(new Position(x, y, floor.from.z));
    }
  }

  return positions;

}

BombermanEvent.prototype.__getSpawnPositions = function () {

  let floor = BOMBERMAN_CONFIG.floor;
  let minX = Math.min(floor.from.x, floor.to.x);
  let maxX = Math.max(floor.from.x, floor.to.x);
  let minY = Math.min(floor.from.y, floor.to.y);
  let maxY = Math.max(floor.from.y, floor.to.y);
  let z = floor.from.z;
  let preferred = [
    new Position(minX, minY, z),
    new Position(maxX, maxY, z),
    new Position(maxX, minY, z),
    new Position(minX, maxY, z)
  ];
  let preferredKeys = new Set(preferred.map(this.__positionKey.bind(this)));
  let crateKeys = new Set(
    this.__getCratePositions().map(this.__positionKey.bind(this))
  );
  let remaining = this.__getAreaPositions(floor).filter(function (position) {
    let key = this.__positionKey(position);
    return !preferredKeys.has(key) && !crateKeys.has(key);
  }, this);

  return preferred.concat(this.__shuffle(remaining));

}

BombermanEvent.prototype.__broadcast = function (message) {

  this.__creatureHandler.getConnectedPlayers().forEach(function (player) {
    player.sendCancelMessage(message);
  });

}

BombermanEvent.prototype.__getConnectedPlayer = function (name) {

  let match = null;
  this.__creatureHandler.getConnectedPlayers().forEach(function (player) {
    if (this.__getPlayerName(player) === name) {
      match = player;
    }
  }, this);
  return match;

}

BombermanEvent.prototype.__addWall = function (position, collection) {

  let tile = gameServer.world.getTileFromWorldPosition(position);

  if (tile === null || tile.id === 0) {
    return false;
  }

  let wall = gameServer.database.createThing(BOMBERMAN_CONFIG.borderWallItemId);

  if (wall === null || typeof tile.addTopThing !== "function") {
    return false;
  }

  tile.addTopThing(wall);
  collection.set(this.__positionKey(position), {
    position: position,
    wall: wall
  });
  gameServer.world.sendMagicEffect(position, CONST.EFFECT.MAGIC.MAGIC_BLUE);
  return true;

}

BombermanEvent.prototype.__buildArena = function () {

  this.__getBorderPositions().forEach(function (position) {
    this.__addWall(position, this.__state.borderItems);
  }, this);

  this.__getCratePositions().forEach(function (position) {
    let tile = gameServer.world.getTileFromWorldPosition(position);

    if (tile === null || tile.id === 0) {
      return;
    }

    let crate = gameServer.database.createThing(BOMBERMAN_CONFIG.crateItemId);
    if (crate === null || typeof tile.addTopThing !== "function") {
      return;
    }

    // Arena crates must behave as fixed one-SQM obstacles even though the
    // ordinary map version of item 1740 is a moveable container.
    crate.isBlockSolid = function () { return true; };
    crate.isBlockProjectile = function () { return true; };
    crate.isMoveable = function () { return false; };
    crate.isPickupable = function () { return false; };
    crate.isContainer = function () { return false; };
    tile.addTopThing(crate);
    this.__state.crateItems.set(this.__positionKey(position), {
      position: position,
      thing: crate
    });
  }, this);

}

BombermanEvent.prototype.__deleteItemEntries = function (entries, effect) {

  entries.forEach(function (entry) {
    let tile = gameServer.world.getTileFromWorldPosition(entry.position);

    if (tile !== null && typeof tile.deleteThing === "function") {
      tile.deleteThing(entry.thing || entry.wall);
    }

    if (effect !== null) {
      gameServer.world.sendMagicEffect(entry.position, effect);
    }
  });
  entries.clear();

}

BombermanEvent.prototype.__cleanupArena = function () {

  if (this.__state === null) {
    return;
  }

  this.__deleteItemEntries(this.__state.bombs, CONST.EFFECT.MAGIC.POFF);
  this.__deleteItemEntries(this.__state.crateItems, CONST.EFFECT.MAGIC.POFF);
  this.__deleteItemEntries(this.__state.borderItems, CONST.EFFECT.MAGIC.POFF);
  this.__state.powerUps.forEach(function (powerUp) {
    gameServer.world.sendMagicEffect(
      powerUp.position,
      CONST.EFFECT.MAGIC.POFF
    );
  });
  this.__state.powerUps.clear();
  this.__state.crateDrops.clear();

  this.__state.hastePlayers.forEach(function (name) {
    let player = this.__getConnectedPlayer(name);
    if (player !== null && typeof player.removeCondition === "function") {
      player.removeCondition(Condition.prototype.HASTE);
    }
  }, this);

}

BombermanEvent.prototype.__teleportParticipantsToStarts = function (spawnPositions) {

  let index = 0;

  this.__state.participants.forEach(function (name) {
    let player = this.__getConnectedPlayer(name);

    if (player === null) {
      return;
    }

    this.__creatureHandler.teleportCreature(
      player,
      spawnPositions[index % spawnPositions.length],
      { ignoreBomberman: true }
    );
    index++;
  }, this);

}

BombermanEvent.prototype.start = function (mode) {

  mode = (mode || "mayhem").toLowerCase();

  if (!["mayhem", "elimination"].includes(mode)) {
    return {
      ok: false,
      message: "Usage: /bomber start mayhem or /bomber start elimination."
    };
  }

  if (this.__state !== null) {
    return { ok: false, message: "A Bomberman round is already running." };
  }

  if (
    this.__creatureHandler.floorLava
    && this.__creatureHandler.floorLava.isRunning()
  ) {
    return { ok: false, message: "Stop Floor is Lava before starting Bomberman." };
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

  if (participants.size < 2) {
    return { ok: false, message: "At least two players must stand on the dance floor." };
  }

  let spawnPositions = this.__getSpawnPositions().filter(function (position) {
    return this.__isWalkableTile(position);
  }, this);

  if (spawnPositions.length < participants.size) {
    return { ok: false, message: "The dance floor does not contain enough free spawn tiles." };
  }

  let now = this.__now();
  let roundMs = mode === "elimination"
    ? BOMBERMAN_CONFIG.eliminationRoundMs
    : BOMBERMAN_CONFIG.mayhemRoundMs;
  this.__state = {
    phase: "countdown",
    mode: mode,
    participants: participants,
    eliminated: new Set(),
    scores: new Map(),
    deaths: new Map(),
    invulnerableUntil: new Map(),
    bombs: new Map(),
    activeBombsByPlayer: new Map(),
    maximumBombsByPlayer: new Map(),
    blastRangeByPlayer: new Map(),
    shields: new Map(),
    powerUps: new Map(),
    crateDrops: new Map(),
    hastePlayers: new Set(),
    borderItems: new Map(),
    crateItems: new Map(),
    startsAt: now + BOMBERMAN_CONFIG.countdownMs,
    endsAt: now + BOMBERMAN_CONFIG.countdownMs + roundMs,
    lastCountdownSecond: 5,
    lastAnnouncedRemaining: null,
    lastBombPulseAt: 0,
    lastPowerUpPulseAt: 0,
    lastShieldPulseAt: 0,
    lastBarrierPulseAt: 0
  };

  participants.forEach(function (name) {
    this.__state.scores.set(name, 0);
    this.__state.deaths.set(name, 0);
    this.__state.activeBombsByPlayer.set(name, 0);
    this.__state.maximumBombsByPlayer.set(
      name,
      BOMBERMAN_CONFIG.initialMaximumBombs
    );
    this.__state.blastRangeByPlayer.set(
      name,
      BOMBERMAN_CONFIG.initialBlastRange
    );
    this.__state.shields.set(name, 0);
  }, this);

  this.__teleportParticipantsToStarts(spawnPositions);
  this.__buildArena();
  this.__planCrateDrops();
  this.__broadcast(
    "Bomberman %s starts in 5 seconds! %s players locked in. Put /bomb on a hotkey."
      .format(mode, participants.size)
  );
  this.__broadcast(
    "Destroy crates to find RANGE, BOMB, SPEED and SHIELD bonuses."
  );

  return { ok: true, message: "Bomberman %s countdown started.".format(mode) };

}

BombermanEvent.prototype.stop = function (reason) {

  if (this.__state === null) {
    return { ok: false, message: "No Bomberman round is running." };
  }

  this.__cleanupArena();
  this.__state = null;
  this.__broadcast(reason || "Bomberman was stopped by a game master.");
  return { ok: true, message: "Bomberman stopped." };

}

BombermanEvent.prototype.getStatus = function () {

  if (this.__state === null) {
    return "Bomberman is not running.";
  }

  let seconds = this.__state.phase === "countdown"
    ? Math.max(0, Math.ceil((this.__state.startsAt - this.__now()) / 1000))
    : Math.max(0, Math.ceil((this.__state.endsAt - this.__now()) / 1000));
  let scores = Array.from(this.__state.scores.entries())
    .sort(function (left, right) {
      return right[1] - left[1];
    })
    .map(function (entry) {
      return "%s: %s".format(entry[0], entry[1]);
    })
    .join(", ");

  if (this.__state.mode === "elimination") {
    return "Bomberman elimination: %s, %ss left, %s/%s players alive."
      .format(
        this.__state.phase,
        seconds,
        this.__getSurvivorNames().length,
        this.__state.participants.size
      );
  }

  return "Bomberman mayhem: %s, %ss left. Scores: %s"
    .format(this.__state.phase, seconds, scores);

}

BombermanEvent.prototype.placeBomb = function (player) {

  if (this.__state === null) {
    return { ok: false, message: "No Bomberman round is running." };
  }

  let name = this.__getPlayerName(player);

  if (!this.__state.participants.has(name)) {
    return { ok: false, message: "You are only spectating this Bomberman round." };
  }

  if (this.__state.eliminated.has(name)) {
    return { ok: false, message: "You are eliminated. Wait for the next round." };
  }

  if (this.__state.phase !== "active") {
    return { ok: false, message: "Wait for GO before placing bombs." };
  }

  if (!this.isOnFloor(player.position)) {
    return { ok: false, message: "You must be on the Bomberman dance floor." };
  }

  if ((this.__state.invulnerableUntil.get(name) || 0) > this.__now()) {
    return { ok: false, message: "You cannot place a bomb during respawn protection." };
  }

  let maximumBombs = this.__state.maximumBombsByPlayer.get(name)
    || BOMBERMAN_CONFIG.initialMaximumBombs;
  if ((this.__state.activeBombsByPlayer.get(name) || 0) >= maximumBombs) {
    return {
      ok: false,
      message: "You already have %s active bomb%s."
        .format(maximumBombs, maximumBombs === 1 ? "" : "s")
    };
  }

  let position = player.position.copy
    ? player.position.copy()
    : new Position(player.position.x, player.position.y, player.position.z);
  let key = this.__positionKey(position);

  if (this.__state.bombs.has(key)) {
    return { ok: false, message: "There is already a bomb on this tile." };
  }

  let tile = gameServer.world.getTileFromWorldPosition(position);
  let thing = gameServer.database.createThing(BOMBERMAN_CONFIG.bombItemId);

  if (tile === null || thing === null || typeof tile.addTopThing !== "function") {
    return { ok: false, message: "A bomb cannot be placed here." };
  }

  thing.isBlockSolid = function () { return true; };
  thing.isBlockProjectile = function () { return true; };
  thing.isMoveable = function () { return false; };
  thing.isPickupable = function () { return false; };
  tile.addTopThing(thing);
  this.__state.bombs.set(key, {
    position: position,
    thing: thing,
    ownerName: name,
    detonatesAt: this.__now() + BOMBERMAN_CONFIG.fuseMs
  });
  this.__state.activeBombsByPlayer.set(
    name,
    (this.__state.activeBombsByPlayer.get(name) || 0) + 1
  );
  if (this.__creatureHandler.partyAchievements) {
    this.__creatureHandler.partyAchievements.increment(player, "bombsPlaced", 1);
  }
  gameServer.world.sendMagicEffect(position, CONST.EFFECT.MAGIC.SOUND_YELLOW);
  return { ok: true, message: "Bomb placed." };

}

BombermanEvent.prototype.__isBlastBlocked = function (position) {

  if (!this.isOnFloor(position)) {
    return true;
  }

  let tile = gameServer.world.getTileFromWorldPosition(position);
  return tile === null || tile.id === 0 || tile.isOccupied();

}

BombermanEvent.prototype.__getBlastPositions = function (bomb) {

  let positions = [bomb.position];
  let crateKeys = new Set();
  let blastRange = this.__state.blastRangeByPlayer.get(bomb.ownerName)
    || BOMBERMAN_CONFIG.initialBlastRange;
  let directions = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 }
  ];

  directions.forEach(function (direction) {
    for (let distance = 1; distance <= blastRange; distance++) {
      let position = bomb.position.addVector(
        direction.x * distance,
        direction.y * distance,
        0
      );
      let key = this.__positionKey(position);

      if (!this.isOnFloor(position)) {
        break;
      }

      if (this.__state.crateItems.has(key)) {
        positions.push(position);
        crateKeys.add(key);
        break;
      }

      if (this.__state.bombs.has(key)) {
        positions.push(position);
        break;
      }

      if (this.__isBlastBlocked(position)) {
        break;
      }

      positions.push(position);
    }
  }, this);

  return {
    positions: positions,
    crateKeys: crateKeys
  };

}

BombermanEvent.prototype.__rollPowerUp = function () {

  if (this.__random() >= BOMBERMAN_CONFIG.powerUpDropChance) {
    return null;
  }

  let roll = this.__random();

  if (roll < 0.4) {
    return "range";
  }
  if (roll < 0.65) {
    return "bomb";
  }
  if (roll < 0.83) {
    return "speed";
  }
  return "shield";

}

BombermanEvent.prototype.__planCrateDrops = function () {

  let crateKeys = this.__shuffle(Array.from(this.__state.crateItems.keys()));
  let guaranteedBombs = Math.min(
    BOMBERMAN_CONFIG.minimumBombPowerUps,
    crateKeys.length
  );

  crateKeys.forEach(function (key, index) {
    this.__state.crateDrops.set(
      key,
      index < guaranteedBombs ? "bomb" : this.__rollPowerUp()
    );
  }, this);

}

BombermanEvent.prototype.__destroyCrates = function (crateKeys) {

  crateKeys.forEach(function (key) {
    let entry = this.__state.crateItems.get(key);
    if (!entry) {
      return;
    }

    let tile = gameServer.world.getTileFromWorldPosition(entry.position);
    if (tile !== null && typeof tile.deleteThing === "function") {
      tile.deleteThing(entry.thing);
    }

    this.__state.crateItems.delete(key);
    gameServer.world.sendMagicEffect(
      entry.position,
      CONST.EFFECT.MAGIC.BLOCKHIT
    );

    let type = this.__state.crateDrops.get(key) || null;
    this.__state.crateDrops.delete(key);
    if (type !== null) {
      this.__state.powerUps.set(key, {
        type: type,
        position: entry.position
      });
      gameServer.world.sendMagicEffect(
        entry.position,
        POWER_UPS[type].effect()
      );
    }
  }, this);

}

BombermanEvent.prototype.__applyPowerUp = function (player, powerUp) {

  let name = this.__getPlayerName(player);
  let message;

  if (powerUp.type === "bomb") {
    let value = Math.min(
      BOMBERMAN_CONFIG.maximumBombs,
      (this.__state.maximumBombsByPlayer.get(name) || 1) + 1
    );
    this.__state.maximumBombsByPlayer.set(name, value);
    message = "+1 BOMB! You may place %s bombs at once.".format(value);
  } else if (powerUp.type === "range") {
    let value = Math.min(
      BOMBERMAN_CONFIG.maximumBlastRange,
      (this.__state.blastRangeByPlayer.get(name) || BOMBERMAN_CONFIG.initialBlastRange) + 1
    );
    this.__state.blastRangeByPlayer.set(name, value);
    message = "+1 RANGE! Your explosions now reach %s SQMs.".format(value);
  } else if (powerUp.type === "speed") {
    if (typeof player.addCondition === "function") {
      player.addCondition(
        Condition.prototype.HASTE,
        BOMBERMAN_CONFIG.hasteTicks,
        BOMBERMAN_CONFIG.hasteTickMs,
        { bonusFactor: BOMBERMAN_CONFIG.hasteBonusFactor }
      );
      this.__state.hastePlayers.add(name);
    }
    message = "SPEED! You are faster for 10 seconds.";
  } else {
    this.__state.shields.set(name, 1);
    message = "SHIELD! The next explosion will not hit you.";
  }

  player.sendCancelMessage(message);
  gameServer.world.sendMagicEffect(
    powerUp.position,
    POWER_UPS[powerUp.type].effect()
  );

}

BombermanEvent.prototype.__collectPowerUpAt = function (player, position) {

  if (this.__state === null || !position) {
    return;
  }

  let name = this.__getPlayerName(player);
  if (
    !this.__state.participants.has(name)
    || this.__state.eliminated.has(name)
  ) {
    return;
  }

  let key = this.__positionKey(position);
  let powerUp = this.__state.powerUps.get(key);
  if (!powerUp) {
    return;
  }

  this.__state.powerUps.delete(key);
  this.__applyPowerUp(player, powerUp);

}

BombermanEvent.prototype.__removeBomb = function (key, bomb) {

  let tile = gameServer.world.getTileFromWorldPosition(bomb.position);

  if (tile !== null && typeof tile.deleteThing === "function") {
    tile.deleteThing(bomb.thing);
  }

  this.__state.bombs.delete(key);
  this.__state.activeBombsByPlayer.set(
    bomb.ownerName,
    Math.max(0, (this.__state.activeBombsByPlayer.get(bomb.ownerName) || 1) - 1)
  );

}

BombermanEvent.prototype.__getRespawnPosition = function (blockedKeys) {

  let candidates = this.__shuffle(this.__getSpawnPositions()).filter(function (position) {
    let key = this.__positionKey(position);
    return !blockedKeys.has(key)
      && !this.__state.bombs.has(key)
      && this.__isFreeTile(position);
  }, this);

  if (candidates.length > 0) {
    return candidates[0];
  }

  candidates = this.__getSpawnPositions().filter(function (position) {
    return !blockedKeys.has(this.__positionKey(position))
      && this.__isWalkableTile(position);
  }, this);

  return candidates.length > 0 ? candidates[0] : null;

}

BombermanEvent.prototype.__getSurvivorNames = function () {

  if (this.__state === null) {
    return [];
  }

  return Array.from(this.__state.participants).filter(function (name) {
    return !this.__state.eliminated.has(name);
  }, this);

}

BombermanEvent.prototype.__hitPlayer = function (player, ownerName, blastKeys) {

  let name = this.__getPlayerName(player);
  let now = this.__now();

  if ((this.__state.invulnerableUntil.get(name) || 0) > now) {
    return;
  }

  if ((this.__state.shields.get(name) || 0) > 0) {
    this.__state.shields.set(name, 0);
    gameServer.world.sendMagicEffect(
      player.position,
      CONST.EFFECT.MAGIC.MAGIC_BLUE
    );
    player.sendCancelMessage("Your shield absorbed the explosion!");
    return;
  }

  this.__state.deaths.set(name, (this.__state.deaths.get(name) || 0) + 1);

  if (ownerName !== name && this.__state.participants.has(ownerName)) {
    this.__state.scores.set(
      ownerName,
      (this.__state.scores.get(ownerName) || 0) + 1
    );
  }

  if (this.__state.mode === "elimination") {
    this.__state.eliminated.add(name);
    gameServer.world.sendMagicEffect(
      player.position,
      CONST.EFFECT.MAGIC.HITBYFIRE
    );

    let audiencePosition = this.__getAudiencePosition();
    if (audiencePosition !== null) {
      this.__creatureHandler.teleportCreature(
        player,
        audiencePosition,
        { ignoreBomberman: true }
      );
    }

    this.__broadcast(
      ownerName === name
        ? "%s eliminated themselves!".format(name)
        : "%s eliminated %s!".format(ownerName, name)
    );
    return;
  }

  this.__state.invulnerableUntil.set(
    name,
    now + BOMBERMAN_CONFIG.respawnProtectionMs
  );
  gameServer.world.sendMagicEffect(player.position, CONST.EFFECT.MAGIC.HITBYFIRE);

  let respawnPosition = this.__getRespawnPosition(blastKeys);
  if (respawnPosition !== null) {
    this.__creatureHandler.teleportCreature(
      player,
      respawnPosition,
      { ignoreBomberman: true }
    );
    gameServer.world.sendMagicEffect(
      respawnPosition,
      CONST.EFFECT.MAGIC.TELEPORT
    );
  }

  player.sendCancelMessage(
    ownerName === name
      ? "You blew yourself up! Respawn protection: 2 seconds."
      : "%s blew you up! Respawn protection: 2 seconds.".format(ownerName)
  );

}

BombermanEvent.prototype.__detonateBombs = function (initialKeys) {

  let queue = initialKeys.slice();
  let queued = new Set(queue);
  let blastEntries = [];
  let destroyedCrateKeys = new Set();
  let chainStarters = initialKeys.map(function (key) {
    let bomb = this.__state.bombs.get(key);
    return bomb ? bomb.ownerName : null;
  }, this).filter(Boolean);

  while (queue.length > 0) {
    let key = queue.shift();
    let bomb = this.__state.bombs.get(key);

    if (!bomb) {
      continue;
    }

    this.__removeBomb(key, bomb);
    let blast = this.__getBlastPositions(bomb);
    blastEntries.push({
      ownerName: bomb.ownerName,
      positions: blast.positions
    });
    blast.crateKeys.forEach(function (crateKey) {
      destroyedCrateKeys.add(crateKey);
    });

    blast.positions.forEach(function (position) {
      let chainedKey = this.__positionKey(position);
      if (this.__state.bombs.has(chainedKey) && !queued.has(chainedKey)) {
        queued.add(chainedKey);
        queue.push(chainedKey);
      }
    }, this);
  }

  this.__destroyCrates(destroyedCrateKeys);

  if (blastEntries.length >= 5 && this.__creatureHandler.partyAchievements) {
    new Set(chainStarters).forEach(function (name) {
      let player = this.__getConnectedPlayer(name);
      if (player) {
        this.__creatureHandler.partyAchievements.setMaximum(
          player,
          "largestBombChain",
          blastEntries.length
        );
      }
    }, this);
  }

  let allBlastKeys = new Set();
  blastEntries.forEach(function (entry) {
    entry.positions.forEach(function (position) {
      allBlastKeys.add(this.__positionKey(position));
      gameServer.world.sendMagicEffect(
        position,
        CONST.EFFECT.MAGIC.EXPLOSIONAREA
      );
    }, this);
  }, this);

  let hitPlayers = new Set();
  blastEntries.forEach(function (entry) {
    let entryKeys = new Set(entry.positions.map(this.__positionKey.bind(this)));

    this.__creatureHandler.getConnectedPlayers().forEach(function (player) {
      let name = this.__getPlayerName(player);

      if (
        !hitPlayers.has(name)
        && this.__state.participants.has(name)
        && entryKeys.has(this.__positionKey(player.position))
      ) {
        hitPlayers.add(name);
        this.__hitPlayer(player, entry.ownerName, allBlastKeys);
      }
    }, this);
  }, this);

  this.__finishEliminationIfResolved();

}

BombermanEvent.prototype.handleDestination = function (player, position) {

  if (this.__state === null || !player || !position) {
    return null;
  }

  let name = this.__getPlayerName(player);
  let isParticipant = this.__state.participants.has(name);
  let isEliminated = this.__state.eliminated.has(name);
  let destinationOnFloor = this.isOnFloor(position);

  if ((!isParticipant || isEliminated) && destinationOnFloor) {
    player.sendCancelMessage(
      isEliminated
        ? "You are eliminated. Wait for the next Bomberman round."
        : "A Bomberman round is running. You are spectating."
    );
    return { position: this.__getAudiencePosition() };
  }

  if (isParticipant && !isEliminated && !destinationOnFloor) {
    player.sendCancelMessage("You cannot leave the arena during Bomberman.");
    return { position: player.position };
  }

  if (
    isParticipant
    && !isEliminated
    && this.__state.phase === "countdown"
  ) {
    return { position: null };
  }

  if (
    isParticipant
    && !isEliminated
    && destinationOnFloor
    && this.__state.bombs.has(this.__positionKey(position))
    && this.__positionKey(position) !== this.__positionKey(player.position)
  ) {
    return { position: null };
  }

  if (isParticipant && !isEliminated && destinationOnFloor) {
    this.__collectPowerUpAt(player, position);
  }

  return null;

}

BombermanEvent.prototype.handlePlayerConnected = function (player) {

  if (this.__state === null) {
    return null;
  }

  let name = this.__getPlayerName(player);

  if (this.__state.eliminated.has(name)) {
    player.sendCancelMessage("You are eliminated. You are spectating.");
    return this.__getAudiencePosition();
  }

  if (this.__state.participants.has(name)) {
    this.__state.invulnerableUntil.set(
      name,
      this.__now() + BOMBERMAN_CONFIG.respawnProtectionMs
    );
    return this.__getRespawnPosition(new Set());
  }

  if (this.isOnFloor(player.position)) {
    player.sendCancelMessage("A Bomberman round is running. You are spectating.");
    return this.__getAudiencePosition();
  }

  return null;

}

BombermanEvent.prototype.__pulseArena = function (now) {

  if (now - this.__state.lastBombPulseAt >= BOMBERMAN_CONFIG.bombPulseMs) {
    this.__state.lastBombPulseAt = now;
    this.__state.bombs.forEach(function (bomb) {
      gameServer.world.sendMagicEffect(
        bomb.position,
        CONST.EFFECT.MAGIC.SOUND_YELLOW
      );
    });
  }

  if (now - this.__state.lastPowerUpPulseAt >= BOMBERMAN_CONFIG.powerUpPulseMs) {
    this.__state.lastPowerUpPulseAt = now;
    this.__state.powerUps.forEach(function (powerUp) {
      gameServer.world.sendMagicEffect(
        powerUp.position,
        POWER_UPS[powerUp.type].effect()
      );
    });
  }

  if (now - this.__state.lastShieldPulseAt >= BOMBERMAN_CONFIG.shieldPulseMs) {
    this.__state.lastShieldPulseAt = now;
    this.__state.shields.forEach(function (charges, name) {
      if (charges <= 0 || this.__state.eliminated.has(name)) {
        return;
      }

      let player = this.__getConnectedPlayer(name);
      if (player !== null) {
        gameServer.world.sendMagicEffect(
          player.position,
          CONST.EFFECT.MAGIC.MAGIC_BLUE
        );
      }
    }, this);
  }

  if (now - this.__state.lastBarrierPulseAt >= BOMBERMAN_CONFIG.barrierPulseMs) {
    this.__state.lastBarrierPulseAt = now;
    this.__state.borderItems.forEach(function (entry, key) {
      gameServer.world.sendMagicEffect(
        entry.position,
        key.length % 2 === 0
          ? CONST.EFFECT.MAGIC.ENERGYHIT
          : CONST.EFFECT.MAGIC.MAGIC_BLUE
      );
    });
  }

}

BombermanEvent.prototype.__finishMayhem = function () {

  let scores = Array.from(this.__state.scores.entries());
  let deaths = this.__state.deaths;
  let bestScore = Math.max.apply(null, scores.map(function (entry) {
    return entry[1];
  }));
  let winners = scores.filter(function (entry) {
    return entry[1] === bestScore;
  }).map(function (entry) {
    return entry[0];
  });

  winners.forEach(function (name) {
    let player = this.__getConnectedPlayer(name);
    if (player !== null) {
      if (this.__creatureHandler.partyAchievements) {
        this.__creatureHandler.partyAchievements.recordBombermanWin(
          player,
          "mayhem",
          deaths.get(name) || 0
        );
      }
      gameServer.world.sendMagicEffect(
        player.position,
        CONST.EFFECT.MAGIC.SOUND_WHITE
      );
    }
  }, this);

  this.__cleanupArena();
  this.__state = null;

  if (winners.length === 1) {
    let winner = this.__getConnectedPlayer(winners[0]);
    if (winner !== null && typeof this.__creatureHandler.focusSpotlightsOnPlayer === "function") {
      this.__creatureHandler.focusSpotlightsOnPlayer(winner);
    }
    this.__broadcast(
      "%s wins Bomberman with %s point%s!"
        .format(winners[0], bestScore, bestScore === 1 ? "" : "s")
    );
    if (typeof this.__creatureHandler.announceNpcYell === "function") {
      this.__creatureHandler.announceNpcYell(
        "DJ Thomas",
        "%s wins Bomberman with %s point%s!"
          .format(winners[0], bestScore, bestScore === 1 ? "" : "s")
      );
    }
    return;
  }

  this.__broadcast(
    "Bomberman ends in a draw: %s (%s points each)!"
      .format(winners.join(", "), bestScore)
  );
  if (typeof this.__creatureHandler.announceNpcYell === "function") {
    this.__creatureHandler.announceNpcYell(
      "DJ Thomas",
      "Bomberman ends in a draw: %s (%s points each)!"
        .format(winners.join(", "), bestScore)
    );
  }

}

BombermanEvent.prototype.__finishElimination = function () {

  let survivors = this.__getSurvivorNames();
  let deaths = this.__state.deaths;

  survivors.forEach(function (name) {
    let player = this.__getConnectedPlayer(name);
    if (player !== null) {
      if (this.__creatureHandler.partyAchievements) {
        this.__creatureHandler.partyAchievements.recordBombermanWin(
          player,
          "elimination",
          deaths.get(name) || 0
        );
      }
      gameServer.world.sendMagicEffect(
        player.position,
        CONST.EFFECT.MAGIC.SOUND_WHITE
      );
    }
  }, this);

  this.__cleanupArena();
  this.__state = null;

  if (survivors.length === 1) {
    let winner = this.__getConnectedPlayer(survivors[0]);
    if (winner !== null && typeof this.__creatureHandler.focusSpotlightsOnPlayer === "function") {
      this.__creatureHandler.focusSpotlightsOnPlayer(winner);
    }
    this.__broadcast("%s wins Bomberman elimination!".format(survivors[0]));
    if (typeof this.__creatureHandler.announceNpcYell === "function") {
      this.__creatureHandler.announceNpcYell(
        "DJ Thomas",
        "%s wins Bomberman elimination!".format(survivors[0])
      );
    }
  } else if (survivors.length === 0) {
    this.__broadcast("Bomberman elimination ends with no survivors!");
  } else {
    this.__broadcast(
      "Bomberman elimination time is up — survivors draw: %s."
        .format(survivors.join(", "))
    );
  }

}

BombermanEvent.prototype.__finishEliminationIfResolved = function () {

  if (
    this.__state !== null
    && this.__state.mode === "elimination"
    && this.__getSurvivorNames().length <= 1
  ) {
    this.__finishElimination();
    return true;
  }

  return false;

}

BombermanEvent.prototype.__eliminateDisconnectedPlayers = function () {

  if (this.__state.mode !== "elimination") {
    return;
  }

  this.__getSurvivorNames().forEach(function (name) {
    if (this.__getConnectedPlayer(name) === null) {
      this.__state.eliminated.add(name);
      this.__broadcast("%s was eliminated after leaving the game.".format(name));
    }
  }, this);

}

BombermanEvent.prototype.__collectStandingPowerUps = function () {

  this.__creatureHandler.getConnectedPlayers().forEach(function (player) {
    this.__collectPowerUpAt(player, player.position);
  }, this);

}

BombermanEvent.prototype.tick = function () {

  if (this.__state === null) {
    return;
  }

  let now = this.__now();
  this.__pulseArena(now);
  this.__collectStandingPowerUps();

  if (this.__state.phase === "countdown") {
    let seconds = Math.max(0, Math.ceil((this.__state.startsAt - now) / 1000));

    if (
      seconds !== this.__state.lastCountdownSecond
      && [3, 2, 1].includes(seconds)
    ) {
      this.__state.lastCountdownSecond = seconds;
      this.__broadcast("Bomberman begins in %s...".format(seconds));
    }

    if (now < this.__state.startsAt) {
      return;
    }

    this.__state.phase = "active";
    this.__broadcast(
      this.__state.mode === "elimination"
        ? "GO! Last player alive wins. Use /bomb."
        : "GO! Score as many hits as possible. Use /bomb."
    );
  }

  this.__eliminateDisconnectedPlayers();
  if (this.__finishEliminationIfResolved()) {
    return;
  }

  if (now >= this.__state.endsAt) {
    if (this.__state.mode === "elimination") {
      this.__finishElimination();
    } else {
      this.__finishMayhem();
    }
    return;
  }

  let remaining = Math.max(0, Math.ceil((this.__state.endsAt - now) / 1000));
  if (
    remaining !== this.__state.lastAnnouncedRemaining
    && [30, 10, 5, 3, 2, 1].includes(remaining)
  ) {
    this.__state.lastAnnouncedRemaining = remaining;
    this.__broadcast("%s seconds left in Bomberman!".format(remaining));
  }

  let dueBombs = [];
  this.__state.bombs.forEach(function (bomb, key) {
    if (now >= bomb.detonatesAt) {
      dueBombs.push(key);
    }
  });

  if (dueBombs.length > 0) {
    this.__detonateBombs(dueBombs);
  }

}

module.exports = BombermanEvent;
