"use strict";

const Corpse = requireModule("entities/corpse");
const Monster = requireModule("monster/monster");
const Player = requireModule("player/player");
const Position = requireModule("utils/position");
const fs = require("fs");
const path = require("path");

const RADIO_EFFECT_STYLES = {
  disco: [CONST.EFFECT.MAGIC.SOUND_GREEN, CONST.EFFECT.MAGIC.SOUND_RED, CONST.EFFECT.MAGIC.SOUND_YELLOW, CONST.EFFECT.MAGIC.SOUND_PURPLE, CONST.EFFECT.MAGIC.SOUND_BLUE, CONST.EFFECT.MAGIC.SOUND_WHITE],
  magic: [CONST.EFFECT.MAGIC.MAGIC_BLUE, CONST.EFFECT.MAGIC.MAGIC_RED, CONST.EFFECT.MAGIC.MAGIC_GREEN],
  rings: [CONST.EFFECT.MAGIC.YELLOW_RINGS, CONST.EFFECT.MAGIC.GREEN_RINGS],
  fire: [CONST.EFFECT.MAGIC.FIREAREA, CONST.EFFECT.MAGIC.HITBYFIRE],
  energy: [CONST.EFFECT.MAGIC.LOSEENERGY, CONST.EFFECT.MAGIC.ENERGYHIT],
  poison: [CONST.EFFECT.MAGIC.HITBYPOISON, CONST.EFFECT.MAGIC.POISONAREA],
  death: [CONST.EFFECT.MAGIC.MORTAREA],
  teleport: [CONST.EFFECT.MAGIC.TELEPORT],
  blood: [CONST.EFFECT.MAGIC.DRAWBLOOD],
  lightning: [CONST.EFFECT.MAGIC.ENERGYHIT, CONST.EFFECT.MAGIC.LOSEENERGY, CONST.EFFECT.MAGIC.SOUND_WHITE]
};

const {
  CreatureForgetPacket,
  CreatureTeleportPacket,
  CreatureMovePacket,
  EffectMagicPacket,
  PlayerLoginPacket,
  RadioStreamPacket
} = requireModule("network/protocol");

const CreatureHandler = function () {

  /*
   * Class CreatureHandler
   * The world handler for all creatures
   * 
   * API:
   *
   * CreatureHandler.getCreatureFromId(id): returns a creature by its identifier or none
   *
   */

  // All creatures
  this.__creatureMap = new Map();

  // Reference all connected players
  this.__playerMap = new Map();

  // Explicitly active sectors for action NPCs
  this.sceneNPCs = new Set();

  // Statistics
  this.__numberActiveMonsters = 0;

  // Browser radio zones
  this.__radioZones = this.__loadRadioZones();
  this.__radioEffectTicks = 0;

  // Unique identifier for creatures (first 0xFFFF are reserved)
  this.__UIDCounter = 0xFFFF;

}

CreatureHandler.prototype.__loadRadioZones = function () {

  /*
   * Function CreatureHandler.__loadRadioZones
   * Loads browser radio zones for area-based music streams.
   */

  let filename = path.resolve(process.cwd(), "data", CONFIG.SERVER.CLIENT_VERSION.toString(), "radio-zones.json");

  if (!fs.existsSync(filename)) {
    return [];
  }

  try {
    return JSON.parse(fs.readFileSync(filename, "utf8")).filter(function (zone) {
      return zone && zone.id && zone.from && zone.to;
    });
  } catch (error) {
    console.error("Could not load radio zones:", error.message);
    return [];
  }

}

CreatureHandler.prototype.__getRadioZoneId = function (position) {

  return "radio-%s-%s-%s".format(position.x, position.y, position.z);

}

CreatureHandler.prototype.getRadioZoneEditorConfig = function (position) {

  /*
   * Returns the editable radio-zone configuration centered on a tile.
   */

  let zone = this.__radioZones.find(function (entry) {
    return entry.id === this.__getRadioZoneId(position);
  }, this);

  return {
    url: zone ? zone.url : "",
    radius: zone && Number.isInteger(zone.radius) ? zone.radius : 4,
    fadeRadius: zone && Number.isInteger(zone.fadeRadius) ? zone.fadeRadius : 5,
    effectsEnabled: !zone || zone.effectsEnabled !== false,
    effectStyles: zone && Array.isArray(zone.effectStyles)
      ? zone.effectStyles.filter(function (style) { return RADIO_EFFECT_STYLES[style]; })
      : [zone && RADIO_EFFECT_STYLES[zone.effectStyle] ? zone.effectStyle : "disco"],
    effectInterval: zone && Number.isFinite(zone.effectIntervalMs) ? zone.effectIntervalMs / 1000 : 2,
    effectIntensity: zone && Number.isInteger(zone.effectIntensity) ? zone.effectIntensity : 3,
    beatBpm: zone && Number.isInteger(zone.beatBpm) ? zone.beatBpm : 0,
    weather: zone && ["none", "rain", "fog", "storm", "snow", "sandstorm", "ash", "embers"].indexOf(zone.weather) !== -1 ? zone.weather : "none",
    light: zone && ["none", "night", "blue", "purple", "red"].indexOf(zone.light) !== -1 ? zone.light : "none",
    discoCanvasEnabled: zone && zone.discoCanvasEnabled === true,
    discoCanvasIntensity: zone && Number.isInteger(zone.discoCanvasIntensity) ? zone.discoCanvasIntensity : 60
  };

}

CreatureHandler.prototype.setRadioZoneAt = function (position, url, radius, fadeRadius, effectsEnabled, effectStyles, effectIntervalMs, effectIntensity, beatBpm, weather, light, discoCanvasEnabled, discoCanvasIntensity, owner) {

  /*
   * Creates or updates the radio zone centered on a particular tile and
   * persists it so the configuration survives server restarts.
   */

  let id = this.__getRadioZoneId(position);
  let zone = {
    id: id,
    name: "Radio zone at %s, %s, %s".format(position.x, position.y, position.z),
    enabled: true,
    url: url,
    volume: 0.75,
    radius: radius,
    fadeRadius: fadeRadius,
    effectsEnabled: effectsEnabled !== false,
    effectStyles: effectStyles,
    effectIntervalMs: effectIntervalMs,
    effectIntensity: effectIntensity,
    beatBpm: beatBpm,
    weather: weather,
    light: light,
    discoCanvasEnabled: discoCanvasEnabled === true,
    discoCanvasIntensity: discoCanvasIntensity,
    fadeMetric: "chebyshev",
    owner: owner,
    center: { x: position.x, y: position.y, z: position.z },
    from: { x: position.x - radius, y: position.y - radius, z: position.z },
    to: { x: position.x + radius, y: position.y + radius, z: position.z }
  };

  let zones = this.__radioZones.filter(function (entry) {
    return entry.id !== id;
  });
  zones.push(zone);

  let filename = path.resolve(process.cwd(), "data", CONFIG.SERVER.CLIENT_VERSION.toString(), "radio-zones.json");

  try {
    fs.writeFileSync(filename, JSON.stringify(zones, null, 2) + "\n", "utf8");
  } catch (error) {
    console.error("Could not save radio zones:", error.message);
    return false;
  }

  this.__radioZones = zones;
  this.__playerMap.forEach(function (player) {
    this.__syncRadioZone(player, null);
  }, this);

  return true;

}

CreatureHandler.prototype.__isInsideRadioCore = function (zone, position) {

  if (!zone || position.z !== zone.from.z || position.z !== zone.to.z) {
    return false;
  }

  if (zone.fadeMetric === "chebyshev" && zone.center) {
    let radius = Math.max(0, Number(zone.radius) || 0);
    return Math.max(
      Math.abs(position.x - zone.center.x),
      Math.abs(position.y - zone.center.y)
    ) <= radius;
  }

  return position.x >= Math.min(zone.from.x, zone.to.x)
    && position.x <= Math.max(zone.from.x, zone.to.x)
    && position.y >= Math.min(zone.from.y, zone.to.y)
    && position.y <= Math.max(zone.from.y, zone.to.y);

}

CreatureHandler.prototype.__syncRadioAmbience = function (player, zone) {

  /*
   * Radio ambience is deliberately client-local: weather and coloured light
   * only affect players standing inside this venue, not the whole world.
   */

  let ambience = zone && this.__isInsideRadioCore(zone, player.position)
    ? {
      weather: zone.weather || "none",
      light: zone.light || "none",
      discoCanvasEnabled: zone.discoCanvasEnabled === true,
      discoCanvasIntensity: Number.isInteger(zone.discoCanvasIntensity) ? zone.discoCanvasIntensity : 60,
      beatBpm: Number.isInteger(zone.beatBpm) ? zone.beatBpm : 0
    }
    : { weather: "none", light: "none", discoCanvasEnabled: false, discoCanvasIntensity: 60, beatBpm: 0 };
  let ambienceKey = JSON.stringify(ambience);

  // Movement calls this synchronizer frequently. Only notify the browser
  // when the local ambience actually changes.
  if (player.__radioAmbienceKey === ambienceKey) {
    return;
  }

  player.__radioAmbienceKey = ambienceKey;
  let payload = encodeURIComponent(JSON.stringify(ambience));
  player.write(new RadioStreamPacket(true, "radio-ambience:" + payload, 0));

}

CreatureHandler.prototype.__playRadioZoneEffects = function () {

  /*
   * Sends a small number of ambient, colourful pulses into each enabled
   * radio zone. Effects are decorative only and are deliberately infrequent
   * so a large venue never floods clients with packets.
   */

  const now = Date.now();

  this.__radioZones.forEach(function (zone) {
    if (!zone.enabled || zone.effectsEnabled === false || !zone.center || !Number.isInteger(zone.radius)) {
      return;
    }

    // BPM takes priority when configured: one pulse per beat gives a stable,
    // club-like rhythm even for external radio streams we cannot inspect.
    let intervalMs = zone.beatBpm
      ? 60000 / zone.beatBpm
      : Math.max(500, Math.min(30000, Number(zone.effectIntervalMs) || 2000));
    if (zone.__lastEffectAt && now - zone.__lastEffectAt < intervalMs) {
      return;
    }

    zone.__lastEffectAt = now;
    let styles = Array.isArray(zone.effectStyles) && zone.effectStyles.length > 0
      ? zone.effectStyles
      : [zone.effectStyle || "disco"];
    let effects = styles.reduce(function (combined, style) {
      return combined.concat(RADIO_EFFECT_STYLES[style] || []);
    }, []);
    effects = effects.length > 0 ? effects : RADIO_EFFECT_STYLES.disco;
    let effectCount = Math.max(1, Math.min(12, Number(zone.effectIntensity) || 3));

    for (let index = 0; index < effectCount; index++) {
      let x = zone.center.x + Math.floor(Math.random() * (zone.radius * 2 + 1)) - zone.radius;
      let y = zone.center.y + Math.floor(Math.random() * (zone.radius * 2 + 1)) - zone.radius;
      let position = new Position(x, y, zone.center.z);
      let effect = effects[Math.floor(Math.random() * effects.length)];

      gameServer.world.sendMagicEffect(position, effect);
    }
  });

}

CreatureHandler.prototype.__getRadioZoneState = function (position) {

  /*
   * Function CreatureHandler.__getRadioZoneState
   * Returns the nearest active radio zone and volume for a position.
   */

  let best = null;

  this.__radioZones.forEach(function (zone) {
    let minX = Math.min(zone.from.x, zone.to.x);
    let maxX = Math.max(zone.from.x, zone.to.x);
    let minY = Math.min(zone.from.y, zone.to.y);
    let maxY = Math.max(zone.from.y, zone.to.y);
    let fadeRadius = Math.max(0, zone.fadeRadius || 0);

    if (position.z !== zone.from.z || position.z !== zone.to.z) {
      return;
    }

    let distance;

    // Radio zones created through /radio use tile-square distance so a radius
    // of 4 really means four SQMs in every direction, including diagonals.
    if (zone.fadeMetric === "chebyshev" && zone.center) {
      let radius = Math.max(0, Number(zone.radius) || 0);
      distance = Math.max(0, Math.max(
        Math.abs(position.x - zone.center.x),
        Math.abs(position.y - zone.center.y)
      ) - radius);
    } else {
      let dx = Math.max(minX - position.x, 0, position.x - maxX);
      let dy = Math.max(minY - position.y, 0, position.y - maxY);
      distance = Math.sqrt(dx * dx + dy * dy);
    }

    if (distance > fadeRadius) {
      return;
    }

    let baseVolume = Math.max(0, Math.min(1, zone.volume === undefined ? 1 : zone.volume));
    let volume = fadeRadius === 0 ? baseVolume : baseVolume * (1 - (distance / fadeRadius));

    if (best === null || volume > best.volume) {
      best = {
        zone: zone,
        volume: volume
      };
    }
  });

  return best;

}

CreatureHandler.prototype.__syncRadioZone = function (player, oldPosition) {

  /*
   * Function CreatureHandler.__syncRadioZone
   * Starts/stops radio playback when a player enters or leaves a radio zone.
   */

  if (!player.is("Player")) {
    return;
  }

  let oldState = oldPosition ? this.__getRadioZoneState(oldPosition) : null;
  let newState = this.__getRadioZoneState(player.position);
  let oldZone = oldState ? oldState.zone : null;
  let newZone = newState ? newState.zone : null;

  this.__syncRadioAmbience(player, newZone);

  if (oldZone && newZone && oldZone.id === newZone.id && Math.abs(oldState.volume - newState.volume) < 0.01) {
    return;
  }

  if (newZone && newZone.enabled && newZone.url) {
    return player.write(new RadioStreamPacket(true, newZone.url, newState.volume));
  }

  return player.write(new RadioStreamPacket(false, "", 0));

}

CreatureHandler.prototype.assignUID = function () {

  /*
   * Function World.assignUID
   * Assigns an incremented unique identifier to a creature or container (up to 2^32)
   */

  // Simply increment the counter to generate a new unique identifier
  return this.__UIDCounter++;

}

CreatureHandler.prototype.getCreatureFromId = function (id) {

  /*
   * Function CreatureHandler.getCreatureFromId
   * Returns a creature from the creature map by its identifier
   */

  // A creature with this identifier does not exist
  if (!this.__creatureMap.has(id)) {
    return null;
  }

  return this.__creatureMap.get(id);

}

CreatureHandler.prototype.isCreatureActive = function (creature) {

  return this.__creatureMap.has(creature.getId());

}

CreatureHandler.prototype.removeCreature = function (creature) {

  /*
   * Function CreatureHandler.removeCreature
   * Removes a creature from the world
   */

  // Does not exist
  if (!this.exists(creature)) {
    return;
  }

  // Delete the creature from the map
  this.__creatureMap.delete(creature.getId());

  // Clean up
  creature.cleanup();

  creature.broadcast(new CreatureForgetPacket(creature.getId()));

  // Get the current chunk
  let chunk = creature.getChunk();
  let tile = creature.getTile();

  if (chunk === null || tile === null) {
    return;
  }

  chunk.removeCreature(creature);
  tile.removeCreature(creature);
  tile.emit("exit", tile, creature);

}

CreatureHandler.prototype.addCreaturePosition = function (creature, position) {

  /*
   * Function CreatureHandler.addCreaturePosition
   * Adds a nonexisting creature to the respective position
   */

  // Already exists
  if (this.exists(creature)) {
    return false;
  }

  // Determine the chunk to add the creature to
  let chunk = gameServer.world.getChunkFromWorldPosition(position);
  let tile = gameServer.world.getTileFromWorldPosition(position);

  // Somehow does not exist
  if (chunk === null || tile === null) {
    return false;
  }

  // Add the creature to the lookup map
  this.__creatureMap.set(creature.getId(), creature);

  // Set the position on the creature
  creature.setPosition(position);

  // Add to chunk and tile
  chunk.addCreature(creature);
  tile.addCreature(creature);

  // Emit the enter event that can be subscribed to
  tile.emit("enter", tile, creature);

  // Add to the chunk
  this.handleChunkChange(creature, null, chunk);

  return true;

}

CreatureHandler.prototype.addPlayer = function (player, position) {

  /*
   * Function World.addPlayer
   * Adds a newly logged in player to the game world
   */

  // Attempt to add the player to the position
  if (!this.addCreaturePosition(player, position)) {
    return false;
  }

  gameServer.world.broadcastPacket(new PlayerLoginPacket(player.getProperty(CONST.PROPERTIES.NAME)));

  // Save a reference to the character name so we can look it up by name
  this.__referencePlayer(player);

  player.broadcast(new EffectMagicPacket(player.position, CONST.EFFECT.MAGIC.TELEPORT));
  this.__syncRadioZone(player, null);

  // Cooldowns
  player.spellbook.applyCooldowns();

  // Write the last visited message
  if (player.lastVisit) {
    player.sendCancelMessage("Welcome back! Your last visit was at %s.".format(new Date(player.lastVisit).toISOString()));
  }

  return true;

}

CreatureHandler.prototype.tick = function () {

  /*
   * Function CreatureHandler.doCreatureActions
   * Applies all actions that creatures & players take
   */

  // Reset the counter
  this.__numberActiveMonsters = 0;

  // Check radio effects four times per second. Each zone applies its own
  // configured interval, so venues can independently control the tempo.
  this.__radioEffectTicks++;
  if (this.__radioEffectTicks >= 5) {
    this.__radioEffectTicks = 0;
    this.__playRadioZoneEffects();
  }

  // Handle always active NPCs
  this.sceneNPCs.forEach(npc => npc.cutsceneHandler.think());

  // Get the unique set of chunks that are activated by a player
  let activeChunks = gameServer.world.lattice.getActiveChunks(this.getConnectedPlayers());

  // Go over each sector activated by a player and make the creatures (monsters & NPCs) think
  activeChunks.forEach(function (chunk) {

    // Save the total number of active monsters
    this.__numberActiveMonsters += chunk.monsters.size;

    // Every character gets to think in this order
    chunk.players.forEach(player => player.think());
    chunk.npcs.forEach(npc => npc.think());
    chunk.monsters.forEach(monster => monster.think());

  }, this);

}

CreatureHandler.prototype.getConnectedPlayers = function () {

  /*
   * Function CreatureHandler.getConnectedPlayers
   * Returns the set of connected players
   */

  return this.__playerMap;

}

CreatureHandler.prototype.__deferencePlayer = function (name) {

  /*
   * Function CreatureHandler.__deferencePlayer
   * Derefences a player from the game world
   */

  // Remove
  return this.__playerMap.delete(name);

}

CreatureHandler.prototype.__referencePlayer = function (player) {

  /*
   * Function CreatureHandler.__referencePlayer
   * References a player in the game world
   */

  return this.__playerMap.set(player.getProperty(CONST.PROPERTIES.NAME), player);

}

CreatureHandler.prototype.createNewPlayer = function (gameSocket, data) {

  /*
   * Function CreatureHandler.createNewPlayer
   * Creates a new player and adds it to the game world
   */

  // Create the class that wraps the data
  let player = new Player(data);
  let position = Position.prototype.fromLiteral(data.position);

  // Find an available tile for the player
  let tile = gameServer.world.findAvailableTile(player, position);

  // Impossible: teleport the player to the temple position
  if (tile === null) {
    tile = gameServer.world.getTileFromWorldPosition(player.templePosition);
  }

  // Temple position is incorrect
  if (tile === null) {
    return gameSocket.closeError("The character temple position is invalid: %s.".format(player.characterStatistics.templePosition.toString()));
  }

  // Add the player
  if (!this.addPlayer(player, tile.position)) {
    return gameSocket.closeError("An unexpected error occurred.");
  }

  // Attach a controller to the player
  player.socketHandler.attachController(gameSocket);

}

CreatureHandler.prototype.exists = function (creature) {

  /*
   * Function CreatureHandler.exists
   * Returns true if a creature exists in the world
   */

  return this.__creatureMap.has(creature.getId());

}

CreatureHandler.prototype.removePlayer = function (player) {

  /*
   * Function World.removePlayer
   * Removes a player from the world and completes a cleanup
   */

  // Remove reference to the player
  this.__deferencePlayer(player.getProperty(CONST.PROPERTIES.NAME));

  // Clean up the player references
  player.cleanup();

  // Remove from the game world
  this.removeCreature(player);

}

CreatureHandler.prototype.removePlayerFromWorld = function (gameSocket) {

  /*
   * Function GameServer.__removePlayerFromWorld
   * Closes a game socket and removes the player from the game world
   */

  // If the game socket is not a controller they are spectating
  if (!gameSocket.isController()) {
    return;
  }

  // Dereference player from gameworld
  gameServer.world.sendMagicEffect(gameSocket.player.position, CONST.EFFECT.MAGIC.POFF);
  gameServer.world.writePlayerLogout(gameSocket.player.getProperty(CONST.PROPERTIES.NAME));
  this.removePlayer(gameSocket.player);

  gameSocket.player.gameSocket = null;

}

CreatureHandler.prototype.getPlayerByName = function (name) {

  /*
   * Function World.getPlayerByName
   * Returns a reference to the gamesocket by player name
   */

  // Guard against undefined/null name
  if (!name) {
    return null;
  }

  // Always capitalize the name
  let upperName = name.capitalize();

  // Does not exist
  if (!this.__playerMap.has(upperName)) {
    return null;
  }

  // Return the gamesocket
  return this.__playerMap.get(upperName);

}

CreatureHandler.prototype.isPlayerOnline = function (player) {

  /*
   * Function World.isPlayerOnline
   * Returns true if a player with a particular name is online
   */

  return this.getPlayerByName(player.getProperty(CONST.PROPERTIES.NAME)) === player;

}

CreatureHandler.prototype.dieCreature = function (creature) {

  /*
   * Function World.dieCreature
   * Call to kill a creature and remove it from the game world
   */

  // Generate the corpse
  let corpse = creature.createCorpse();

  // Add the corpse only if it exists
  if (corpse !== null) {
    gameServer.world.addTopThing(creature.getPosition(), corpse);

    // Also add a splash when the creature is killed
    if (corpse instanceof Corpse) {
      gameServer.world.addSplash(2016, creature.getPosition(), corpse.getFluidType());
    }
  }

  // Remove the creature from the world
  this.removeCreature(creature);

}

CreatureHandler.prototype.spawnCreature = function (cid, position) {

  /*
   * Function World.spawnCreature
   * Spawns a creature to the world from the configured spawn data
   */

  let data = gameServer.database.getMonster(cid);

  if (data === null) {
    return;
  }

  let monster = new Monster(cid, data);

  // Find an available tile for the player
  let tile = gameServer.world.findAvailableTile(monster, position);

  // Impossible to add the creature
  if (tile === null) {
    return;
  }

  // Add the creature to the world at the position
  this.addCreaturePosition(monster, tile.position);
  gameServer.world.sendMagicEffect(tile.position, CONST.EFFECT.MAGIC.TELEPORT);

}

CreatureHandler.prototype.handleChunkChange = function (creature, oldChunk, newChunk) {

  /*
   * Function CreatureHandler.handleChunkChange
   * Handles change from one chunk to another
   */

  // No change in chunk was detected: do nothing
  if (oldChunk === newChunk) {
    return;
  }

  // Only old neighbours
  if (newChunk === null) {
    return creature.leaveOldChunks(oldChunk.neighbours);
  }

  // Only new neighbours
  if (oldChunk === null) {
    return creature.enterNewChunks(newChunk.neighbours);
  }

  // Enter and leave the complements of the old/new chunks
  creature.enterNewChunks(oldChunk.difference(newChunk));
  creature.leaveOldChunks(newChunk.difference(oldChunk));

}

CreatureHandler.prototype.updateCreaturePosition = function (creature, position) {

  /*
   * Function World.updateCreaturePosition
   * Handles movement of an creature in the world
   */

  // Get the new chunk at the new position
  let oldChunk = gameServer.world.getChunkFromWorldPosition(creature.position);
  let newChunk = gameServer.world.getChunkFromWorldPosition(position);

  // If the new position falls within a new chunk: introduce yourself there
  this.handleChunkChange(creature, oldChunk, newChunk);

  // Unset the old tile and chunk
  let oldPosition = creature.position;
  let oldTile = gameServer.world.getTileFromWorldPosition(oldPosition);
  oldTile.removeCreature(creature);
  oldChunk.removeCreature(creature);

  // Actually update the position
  creature.position = position;

  // Set the new tile and chunk
  let newTile = gameServer.world.getTileFromWorldPosition(position);
  newChunk.addCreature(creature);
  newTile.addCreature(creature);

  // Special handling for players entering a new tile
  if (!creature.is("Player")) {
    return;
  }

  // Write an alert to all NPCs in the new sector
  this.__alertNPCEnter(creature);

  // Always check containers after moving
  creature.containerManager.checkContainers();
  this.__syncRadioZone(creature, oldPosition);

}

CreatureHandler.prototype.__alertNPCEnter = function (creature) {

  /*
   * Function World.__alertNPCEnter
   * Emits an enter event to the NPC when a creature walks in range
   */

  // Go over all neighbouring sectors and NPCs
  gameServer.world.getSpectatingChunks(creature).forEach(function (chunk) {

    chunk.npcs.forEach(function (npc) {

      if (npc.cutsceneHandler.isInScene()) {
        return;
      }

      // Skip alert on self
      if (creature === npc) {
        return;
      }

      if (npc.conversationHandler.hasSeen(creature)) {
        return;
      }

      // Within range 6 emit an enter event
      if (npc.isWithinRangeOf(creature, 5)) {
        return npc.conversationHandler.enterAlert(creature);
      }

    });

  });

}

CreatureHandler.prototype.teleportCreature = function (creature, position) {

  /*
   * Function Creature.teleportCreature
   * Teleports a creature to a particular world position
   */

  let tile = gameServer.world.getTileFromWorldPosition(position);
  let oldPosition = creature.position;
  let oldTile = gameServer.world.getTileFromWorldPosition(oldPosition);

  // Not possible
  if (tile === null) {
    return false;
  }

  // Find the destination through other portals etc..
  let destination = gameServer.world.lattice.findDestination(creature, tile);

  if (destination === null) {
    destination = creature;
  }

  // Try to set the position: it may fail however
  this.updateCreaturePosition(creature, destination.position);

  destination.broadcast(new CreatureTeleportPacket(creature.getId(), destination.getPosition()));

  // Clear movement buffer for players after teleport to prevent auto-walk
  if (creature.isPlayer() && creature.movementHandler) {
    creature.movementHandler.__setMoveBuffer(null);
  }

  creature.emit("move", tile);
  oldTile.emit("exit", oldTile, creature);
  tile.emit("enter", tile, creature);

  // Success
  return true;

}

CreatureHandler.prototype.moveCreature = function (creature, position) {

  /*
   * Function World.moveCreature
   * Moves a creature from one position to a new position
   */

  // Get the tile the creature wants to move to
  let tile = gameServer.world.getTileFromWorldPosition(position);

  if (creature.isDrunk() && Math.random() < 0.1) {
    creature.sayEmote("Hicks!", CONST.COLOR.ORANGE);
  }

  // Handle elevation moving up & down
  if (creature.isPlayer()) {

    if (tile === null) {

      let dtile = gameServer.world.getTileFromWorldPosition(position.down());
      if (dtile.hasElevation() && !creature.position.isDiagonal(position)) {
        return this.teleportCreature(creature, position.down());
      }
      return false;
    }

    // Elevation up
    if (gameServer.world.getTileFromWorldPosition(creature.position).hasElevation() && tile.isOccupied() && !creature.position.isDiagonal(position)) {
      if (gameServer.world.getTileFromWorldPosition(creature.position.up().south().east()) === null) {
        return this.teleportCreature(creature, position.up());
      }
    }

  }

  if (tile === null || tile.id === 0) {
    return false;
  }

  // Stop if the tile is occupied for the creature
  if (creature.isTileOccupied(tile)) {
    return false;
  }

  // NPCs can open doors
  if ((creature.is("NPC") || creature.is("Monster")) && creature.behaviourHandler.openDoors) {
    creature.behaviourHandler.handleOpenDoor(tile.getTopItem());
  }

  // Let us update the facing direction of the creature
  let direction = creature.position.getFacingDirection(position);

  if (direction !== null) {
    creature.setDirection(direction);
  }

  // Get the destination tile: this may be different from the requested position
  if (tile.hasDestination()) {
    return this.teleportCreature(creature, position);
  }

  // Losing target
  if (creature.isPlayer() && creature.actionHandler.targetHandler.hasTarget()) {
    if (!creature.canSee(creature.actionHandler.targetHandler.getTarget().getPosition())) {
      creature.actionHandler.targetHandler.setTarget(null);
      creature.sendCancelMessage("Target lost.");
    }
  }

  let oldPosition = creature.position;
  let oldTile = gameServer.world.getTileFromWorldPosition(oldPosition);

  // Set the creature position
  this.updateCreaturePosition(creature, position);

  // Movement callback events
  creature.emit("move", tile);

  // Step duration
  let stepDuration = creature.getStepDuration(tile.getFriction());
  if (oldPosition.isDiagonal(position)) {
    stepDuration = Math.ceil(stepDuration * Math.SQRT2);
  }

  // Write packet to all spectators
  creature.broadcast(new CreatureMovePacket(creature.getId(), position, stepDuration));

  tile.emit("enter", tile, creature);
  oldTile.emit("exit", oldTile, creature);

  // Check for magic fields and apply damage
  if (tile.hasItems()) {
    tile.itemStack.applyFieldDamage(creature);
  }

  return true;

}

CreatureHandler.prototype.addCreatureSpawn = function (creature, literal) {

  if (literal === null) {
    return;
  }

  let position = Position.prototype.fromLiteral(literal);
  creature.position = creature.spawnPosition = position;
  this.addCreaturePosition(creature, position);

}

module.exports = CreatureHandler;
