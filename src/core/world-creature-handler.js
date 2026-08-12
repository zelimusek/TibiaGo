"use strict";

const Corpse = requireModule("entities/corpse");
const Monster = requireModule("monster/monster");
const Player = requireModule("player/player");
const Condition = requireModule("combat/condition");
const Position = requireModule("utils/position");
const FloorLavaEvent = requireModule("core/floor-lava-event");
const BombermanEvent = requireModule("core/bomberman-event");
const LaserChairsEvent = requireModule("core/laser-chairs-event");
const PartyGameFlow = requireModule("core/party-game-flow");
const PartyBouncerEvent = requireModule("core/party-bouncer-event");
const PartyAchievementSystem = requireModule("core/party-achievement-system");
const PartyRadioQueue = requireModule("core/party-radio-queue");
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

const PARTY_DANCE_FLOOR_CENTER = { x: 32515, y: 32346, z: 7 };
const PARTY_DANCE_FLOOR_AREA = {
  from: { x: 32509, y: 32340, z: 7 },
  to: { x: 32521, y: 32352, z: 7 }
};
const SPOTLIGHT_FOCUS_DURATION_MS = 11200;
const SPOTLIGHT_FOCUS_FLASH_DURATION_MS = 3000;
const SPOTLIGHT_FOCUS_FLASH_COUNT = 3;
const VIP_SHOW_DURATION_MS = 12000;
const VIP_SHOW_ALL_DURATION_MS = 54000;
const VIP_SHOW_MAX_PARTICIPANTS = 24;
const VIP_SHOW_PRESETS = new Set(["rainbow", "fire", "ice", "toxic", "romance"]);
const VIP_SHOW_INTENSITIES = new Set(["soft", "normal", "intense"]);
const VIP_SHOW_EFFECTS = new Set([
  "laser", "hologram", "wings", "equalizer", "vortex", "portal", "comet",
  "rewind", "helix", "pixel", "soundwave", "cage", "duel", "discoball",
  "constellation", "combo", "name", "circuit", "all"
]);
const LASER_SHOW_DEFAULT_DURATION_MS = 75000;
const LASER_SHOW_OVERDRIVE_DURATION_MS = 100000;
const LASER_SHOW_DIMENSION_DURATION_MS = 100000;
const LASER_SHOW_ARCADE_DURATION_MS = 100000;
const LASER_SHOW_OUTRO_MS = 1300;
const LASER_SHOW_MAX_TEXT_LENGTH = 12;
const PARTY_READABLE_POSITIONS = {
  "32517,32391,7": function (onlinePlayers, partyPlayers) {
    return "       Welcome to:\n"
      + "CYRK'S PARTY ZONE!\n"
      + "Currently we have " + onlinePlayers + " players online\n"
      + "and " + partyPlayers + " of them in the dance hall!";
  },
  "32517,32357,7": function (onlinePlayers, partyPlayers) {
    return "The party is on!\n"
      + partyPlayers + " players are already inside.\n"
      + "Join them and hit the dance floor!";
  },
  "32513,32357,7": function (onlinePlayers, partyPlayers) {
    return "Join the party!\n"
      + "Two amazing DJs, awesome beats, fun games and "
      + partyPlayers + " players on the dance floor!";
  }
};

const {
  ChunkPacket,
  CreatureForgetPacket,
  CreatureSkullPacket,
  CreatureTeleportPacket,
  CreatureMovePacket,
  CreatureStatePacket,
  CreatureYellPacket,
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

  // Dead players keep their socket until the death modal is acknowledged,
  // but must no longer occupy a world tile or an active chunk meanwhile.
  this.__detachedCreaturePositions = new WeakSet();

  // Explicitly active sectors for action NPCs
  this.sceneNPCs = new Set();

  // Statistics
  this.__numberActiveMonsters = 0;

  // Browser radio zones
  this.__radioZones = this.__loadRadioZones();
  this.partyRadioQueue = new PartyRadioQueue(this);
  this.__radioEffectTicks = 0;
  this.__spotlightFocus = null;
  this.__laserShow = null;

  // One short dance contest may run in the club at a time.
  this.__clubDance = null;

  // Server-authoritative Floor is Lava event for the disco dance floor.
  this.floorLava = new FloorLavaEvent(this);

  // Safe, score-based Bomberman event on the same disco dance floor.
  this.bomberman = new BombermanEvent(this);

  // Server-authoritative musical chairs played with laser-drawn SQMs.
  this.laserChairs = new LaserChairsEvent(this);

  // Automatic party lobby, Laser Roulette and winner-controlled game chain.
  this.partyGameFlow = new PartyGameFlow(this);

  // Two coordinated door bouncers, their physical queue and per-player passes.
  this.partyBouncers = new PartyBouncerEvent(this);

  // Persistent party achievements, progress counters and visible titles.
  this.partyAchievements = new PartyAchievementSystem(this);

  // Unique identifier for creatures (first 0xFFFF are reserved)
  this.__UIDCounter = 0xFFFF;

}

CreatureHandler.prototype.startClubDance = function () {

  if(this.__clubDance !== null) {
    return false;
  }

  this.__clubDance = {
    endsAt: Date.now() + 30000,
    scores: new Map(),
    positions: new Map()
  };
  this.__broadcastClubDance("Dance contest started! Move around the dance floor for 30 seconds.");
  return true;

}

CreatureHandler.prototype.__broadcastClubDance = function (message) {

  this.__playerMap.forEach(function (player) {
    player.sendCancelMessage(message);
  });

}

CreatureHandler.prototype.applyClubDrinkAura = function (player, effect) {

  let effects = Array.isArray(effect) ? effect : [effect];
  player.__clubDrinkAura = { effects: effects, expiresAt: Date.now() + 60000 };
  gameServer.world.sendMagicEffect(player.position, effects[0]);

}

CreatureHandler.prototype.__tickClubDrinkAuras = function () {

  let now = Date.now();
  this.__playerMap.forEach(function (player) {
    if(!player.__clubDrinkAura) {
      return;
    }
    if(player.__clubDrinkAura.expiresAt <= now) {
      delete player.__clubDrinkAura;
      return;
    }
    let effects = player.__clubDrinkAura.effects || [player.__clubDrinkAura.effect];
    gameServer.world.sendMagicEffect(player.position, effects[Math.floor(Math.random() * effects.length)]);
  });

}

CreatureHandler.prototype.__isOnClubDanceFloor = function (position) {

  return position.z === 7 && position.x >= 32408 && position.x <= 32413 && position.y >= 32172 && position.y <= 32175;

}

CreatureHandler.prototype.__tickClubDance = function () {

  if(this.__clubDance === null) {
    return;
  }

  let contest = this.__clubDance;
  if(Date.now() < contest.endsAt) {
    this.__playerMap.forEach(function (player) {
      if(!this.__isOnClubDanceFloor(player.position)) {
        return;
      }

      let positionKey = "%s:%s:%s".format(player.position.x, player.position.y, player.position.z);
      if(contest.positions.get(player.name) !== positionKey) {
        contest.positions.set(player.name, positionKey);
        contest.scores.set(player.name, (contest.scores.get(player.name) || 0) + 1);
        process.gameServer.world.sendMagicEffect(player.position, CONST.EFFECT.MAGIC.SOUND_PURPLE);
      }
    }, this);
    return;
  }

  let contenders = [];
  this.__playerMap.forEach(function (player) {
    let score = contest.scores.get(player.name) || 0;
    if(score > 0 && this.__isOnClubDanceFloor(player.position)) {
      contenders.push({ player: player, score: score });
    }
  }, this);
  this.__clubDance = null;

  if(contenders.length === 0) {
    return this.__broadcastClubDance("Dance contest ended — nobody kept dancing on the floor.");
  }

  let bestScore = Math.max.apply(null, contenders.map(function (entry) { return entry.score; }));
  let winners = contenders.filter(function (entry) { return entry.score === bestScore; });
  let winner = winners[Math.floor(Math.random() * winners.length)].player;
  winner.addCondition(Condition.prototype.HASTE, 60, 500, null);
  winner.addCondition(Condition.prototype.MORPH, 120, 500, { id: 128, details: { head: 94, body: 114, legs: 94, feet: 114 } });
  process.gameServer.world.sendMagicEffect(winner.position, CONST.EFFECT.MAGIC.SOUND_WHITE);
  this.__broadcastClubDance("%s wins the dance contest with %s dance moves! Neon Champion look and Turbo speed for 30 seconds.".format(winner.name, bestScore));

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
  let activeState = this.__getRadioZoneState(position);
  let musicZone = zone || (activeState ? activeState.zone : null);

  return {
    zoneId: zone ? zone.id : this.__getRadioZoneId(position),
    musicZoneId: musicZone ? musicZone.id : null,
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
    rhythmMode: zone && zone.rhythmMode === "fixed" ? "fixed" : "auto",
    bassSensitivity: zone && Number.isInteger(zone.bassSensitivity) ? zone.bassSensitivity : 50,
    weather: zone && ["none", "rain", "fog", "storm", "snow", "sandstorm", "ash", "embers"].indexOf(zone.weather) !== -1 ? zone.weather : "none",
    light: zone && ["none", "night", "blue", "purple", "red"].indexOf(zone.light) !== -1 ? zone.light : "none",
    spotlightsEnabled: zone && zone.spotlightsEnabled !== undefined
      ? zone.spotlightsEnabled === true
      : zone && zone.discoCanvasEnabled === true,
    legacyLasersEnabled: zone && zone.legacyLasersEnabled !== undefined
      ? zone.legacyLasersEnabled === true
      : zone && zone.discoCanvasEnabled === true,
    discoCanvasIntensity: zone && Number.isInteger(zone.discoCanvasIntensity) ? zone.discoCanvasIntensity : 60,
    spotlightSpeed: zone && Number.isInteger(zone.spotlightSpeed) && zone.spotlightSpeed >= 0 && zone.spotlightSpeed <= 250 ? zone.spotlightSpeed : 100,
    musicLibrary: this.partyRadioQueue.getLibrary(),
    musicQueue: musicZone ? this.partyRadioQueue.getStatus(musicZone.id) : null
  };

}

CreatureHandler.prototype.setRadioZoneAt = function (position, url, radius, fadeRadius, effectsEnabled, effectStyles, effectIntervalMs, effectIntensity, beatBpm, weather, light, spotlightsEnabled, legacyLasersEnabled, discoCanvasIntensity, spotlightSpeed, rhythmMode, bassSensitivity, owner) {

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
    rhythmMode: rhythmMode === "fixed" ? "fixed" : "auto",
    bassSensitivity: Number.isInteger(bassSensitivity) ? bassSensitivity : 50,
    weather: weather,
    light: light,
    // Keep the old aggregate flag so cached clients and older saved zones
    // remain compatible while the two effects can now be toggled separately.
    discoCanvasEnabled: spotlightsEnabled === true || legacyLasersEnabled === true,
    spotlightsEnabled: spotlightsEnabled === true,
    legacyLasersEnabled: legacyLasersEnabled === true,
    discoCanvasIntensity: discoCanvasIntensity,
    spotlightSpeed: spotlightSpeed,
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

CreatureHandler.prototype.getRadioZoneAt = function (position) {
  let id = this.__getRadioZoneId(position);
  return this.__radioZones.find(function (zone) { return zone.id === id; }) || null;
}

CreatureHandler.prototype.getRadioZoneById = function (zoneId) {
  return this.__radioZones.find(function (zone) { return zone.id === zoneId; }) || null;
}

CreatureHandler.prototype.resyncRadioZonePlayers = function (zoneId) {
  this.__playerMap.forEach(function (player) {
    let state = this.__getRadioZoneState(player.position);
    if (state && state.zone && state.zone.id === zoneId) {
      this.__syncRadioZone(player, null);
    }
  }, this);
}

CreatureHandler.prototype.getPartyRadioPlayerCount = function () {

  /*
   * Counts connected players inside the active /radio core that covers the
   * disco dance floor. Other radio zones elsewhere in the world must not
   * inflate the party noticeboards.
   */

  let zones = Array.isArray(this.__radioZones)
    ? this.__radioZones.filter(function (zone) {
      return zone.enabled !== false
        && this.__isInsideRadioCore(zone, PARTY_DANCE_FLOOR_CENTER);
    }, this)
    : [];

  if (zones.length === 0) {
    return 0;
  }

  let count = 0;
  this.getConnectedPlayers().forEach(function (player) {
    if (player && player.position && zones.some(function (zone) {
      return this.__isInsideRadioCore(zone, player.position);
    }, this)) {
      count++;
    }
  }, this);

  return count;

}

CreatureHandler.prototype.isInsidePartyRadioZone = function (position) {
  if (!position || !Array.isArray(this.__radioZones)) return false;
  return this.__radioZones.some(function (zone) {
    return zone.enabled !== false
      && this.__isInsideRadioCore(zone, PARTY_DANCE_FLOOR_CENTER)
      && this.__isInsideRadioCore(zone, position);
  }, this);
}

CreatureHandler.prototype.__resyncRadioAmbience = function () {
  this.__playerMap.forEach(function (player) {
    let state = this.__getRadioZoneState(player.position);
    player.__radioAmbienceKey = null;
    this.__syncRadioAmbience(player, state ? state.zone : null);
  }, this);
}

CreatureHandler.prototype.focusSpotlightsOnPlayer = function (player, options) {
  if (!player || typeof player.getId !== "function" || !player.position) {
    return { ok: false, message: "That player is not online." };
  }

  if (!this.isInsidePartyRadioZone(player.position)) {
    return { ok: false, message: "That player must be inside the dance hall." };
  }

  options = options || {};
  let now = Date.now();
  let duration = Number.isInteger(options.durationMs) && options.durationMs > 0
    ? options.durationMs
    : null;
  let flashing = options.flashing === true && duration !== null;
  let includeLasers = options.includeLasers === true;
  let vipShow = options.vipShow && typeof options.vipShow === "object"
    ? {
      effect: VIP_SHOW_EFFECTS.has(options.vipShow.effect) ? options.vipShow.effect : "laser",
      preset: VIP_SHOW_PRESETS.has(options.vipShow.preset) ? options.vipShow.preset : "rainbow",
      intensity: VIP_SHOW_INTENSITIES.has(options.vipShow.intensity) ? options.vipShow.intensity : "normal",
      crowd: options.vipShow.crowd === true,
      participants: Array.isArray(options.vipShow.participants)
        ? options.vipShow.participants.slice(0, VIP_SHOW_MAX_PARTICIPANTS).filter(function (participant) {
          return participant
            && Number.isInteger(participant.targetId)
            && participant.target
            && participant.target.position;
        })
        : []
    }
    : null;
  this.__laserShow = null;
  this.__spotlightFocus = {
    targetId: player.getId(),
    targetName: player.getProperty(CONST.PROPERTIES.NAME),
    target: player,
    source: options.source || "unknown",
    startedAt: now,
    endsAt: duration === null ? null : now + duration,
    flashDurationMs: flashing ? Math.min(SPOTLIGHT_FOCUS_FLASH_DURATION_MS, duration) : 0,
    flashCount: flashing ? SPOTLIGHT_FOCUS_FLASH_COUNT : 0,
    includeLasers: includeLasers,
    vipShow: vipShow
  };
  console.log("[SPOTLIGHT FOCUS] %s", JSON.stringify({
    action: "start",
    source: this.__spotlightFocus.source,
    targetId: this.__spotlightFocus.targetId,
    targetName: this.__spotlightFocus.targetName,
    durationMs: duration,
    flashing: flashing,
    includeLasers: includeLasers,
    vipShow: vipShow
      ? {
        effect: vipShow.effect,
        preset: vipShow.preset,
        intensity: vipShow.intensity,
        crowd: vipShow.crowd,
        participantIds: vipShow.participants.map(function (participant) {
          return participant.targetId;
        })
      }
      : null
  }));
  this.__resyncRadioAmbience();

  return {
    ok: true,
    message: duration === null
      ? (includeLasers
        ? "All spotlights and lasers are now following %s until /spotlights off."
        : "All spotlights are now following %s until /spotlight off.")
        .format(this.__spotlightFocus.targetName)
      : (includeLasers
        ? "All spotlights and lasers are now following %s for %s seconds."
        : "All spotlights are now following %s for %s seconds.")
        .format(this.__spotlightFocus.targetName, Math.ceil(duration / 1000))
  };
}

CreatureHandler.prototype.isOnPartyDanceFloor = function (position) {
  return Boolean(position)
    && position.z === PARTY_DANCE_FLOOR_AREA.from.z
    && position.x >= PARTY_DANCE_FLOOR_AREA.from.x
    && position.x <= PARTY_DANCE_FLOOR_AREA.to.x
    && position.y >= PARTY_DANCE_FLOOR_AREA.from.y
    && position.y <= PARTY_DANCE_FLOOR_AREA.to.y;
}

CreatureHandler.prototype.__getDanceFloorPlayers = function () {
  let players = [];
  if (!(this.__playerMap instanceof Map)) return players;

  this.__playerMap.forEach(function (player) {
    if (!player || typeof player.getId !== "function" || !player.position) return;
    if (!this.isOnPartyDanceFloor(player.position)) return;
    players.push(player);
  }, this);

  return players.sort(function (left, right) {
    return left.getId() - right.getId();
  }).slice(0, VIP_SHOW_MAX_PARTICIPANTS);
}

CreatureHandler.prototype.__toVipShowParticipant = function (player) {
  return {
    targetId: player.getId(),
    targetName: player.getProperty(CONST.PROPERTIES.NAME),
    target: player
  };
}

CreatureHandler.prototype.__refreshCrowdShowParticipants = function () {
  let focus = this.__spotlightFocus;
  if (!focus || !focus.vipShow || focus.vipShow.crowd !== true) return false;

  let players = this.__getDanceFloorPlayers();
  if (players.length === 0) {
    this.__spotlightFocus = null;
    this.__resyncRadioAmbience();
    return true;
  }

  let signature = players.map(function (player) { return player.getId(); }).join(",");
  if (focus.vipShow.participantSignature === signature) return false;

  focus.vipShow.participants = players.map(this.__toVipShowParticipant.bind(this));
  focus.vipShow.participantSignature = signature;

  let anchor = players.find(function (player) { return player.getId() === focus.targetId; });
  if (!anchor) {
    anchor = players[0];
    focus.target = anchor;
    focus.targetId = anchor.getId();
    focus.targetName = anchor.getProperty(CONST.PROPERTIES.NAME);
  }

  console.log("[VIP CROWD SHOW] %s", JSON.stringify({
    action: "participants",
    participantIds: players.map(function (player) { return player.getId(); })
  }));
  this.__resyncRadioAmbience();
  return true;
}

CreatureHandler.prototype.startVipShow = function (player, effect, preset, intensity) {
  effect = String(effect || "laser").toLowerCase();
  preset = String(preset || "rainbow").toLowerCase();
  intensity = String(intensity || "normal").toLowerCase();

  if (!VIP_SHOW_EFFECTS.has(effect)) {
    return {
      ok: false,
      message: "Unknown show effect. Use laser, hologram, wings, equalizer, vortex, portal, comet, rewind, helix, pixel, soundwave, cage, duel, discoball, constellation, combo, name, circuit or all."
    };
  }
  if (effect === "circuit") {
    return { ok: false, message: "Circuit is a crowd-only show. Use /show crowd circuit." };
  }
  if (!VIP_SHOW_PRESETS.has(preset)) {
    return {
      ok: false,
      message: "Unknown show preset. Use rainbow, fire, ice, toxic or romance."
    };
  }
  if (!VIP_SHOW_INTENSITIES.has(intensity)) {
    return {
      ok: false,
      message: "Unknown show intensity. Use soft, normal or intense."
    };
  }

  let targetId = player.getId();
  let participants = [];
  if (this.__playerMap instanceof Map) {
    this.__playerMap.forEach(function (participant) {
      if (!participant || typeof participant.getId !== "function" || !participant.position) return;
      if (participant.getId() === targetId || !this.isInsidePartyRadioZone(participant.position)) return;
      participants.push({
        targetId: participant.getId(),
        targetName: participant.getProperty(CONST.PROPERTIES.NAME),
        target: participant
      });
    }, this);
  }

  let durationMs = effect === "all" ? VIP_SHOW_ALL_DURATION_MS : VIP_SHOW_DURATION_MS;
  let result = this.focusSpotlightsOnPlayer(player, {
    durationMs: durationMs,
    flashing: false,
    includeLasers: true,
    source: "vip-show",
    vipShow: {
      effect: effect,
      preset: preset,
      intensity: intensity,
      participants: participants
    }
  });

  if (result.ok) {
    result.message = "%s receives the %s show in %s style (%s) for %s seconds!"
      .format(this.__spotlightFocus.targetName, effect, preset, intensity, Math.ceil(durationMs / 1000));
  }
  return result;
}

CreatureHandler.prototype.startCrowdShow = function (effect, preset, intensity) {
  effect = String(effect || "laser").toLowerCase();
  preset = String(preset || "rainbow").toLowerCase();
  intensity = String(intensity || "normal").toLowerCase();

  if (!VIP_SHOW_EFFECTS.has(effect)) {
    return { ok: false, message: "Unknown show effect. Use /show effects for the full list." };
  }
  if (!VIP_SHOW_PRESETS.has(preset)) {
    return { ok: false, message: "Unknown show preset. Use rainbow, fire, ice, toxic or romance." };
  }
  if (!VIP_SHOW_INTENSITIES.has(intensity)) {
    return { ok: false, message: "Unknown show intensity. Use soft, normal or intense." };
  }

  let players = this.__getDanceFloorPlayers();
  if (players.length === 0) {
    return { ok: false, message: "At least one player must be standing on the 13x13 dance floor." };
  }

  players.sort(function (left, right) {
    function distance(player) {
      return Math.max(
        Math.abs(player.position.x - PARTY_DANCE_FLOOR_CENTER.x),
        Math.abs(player.position.y - PARTY_DANCE_FLOOR_CENTER.y)
      );
    }
    return distance(left) - distance(right) || left.getId() - right.getId();
  });

  let durationMs = effect === "all" ? VIP_SHOW_ALL_DURATION_MS : VIP_SHOW_DURATION_MS;
  let result = this.focusSpotlightsOnPlayer(players[0], {
    durationMs: durationMs,
    flashing: false,
    includeLasers: true,
    source: "vip-crowd-show",
    vipShow: {
      effect: effect,
      preset: preset,
      intensity: intensity,
      crowd: true,
      participants: players.map(this.__toVipShowParticipant.bind(this))
    }
  });

  if (result.ok) {
    this.__spotlightFocus.vipShow.participantSignature = players
      .map(function (player) { return player.getId(); })
      .sort(function (left, right) { return left - right; })
      .join(",");
    result.message = "Crowd %s show started for %s dancers in %s style (%s) for %s seconds!"
      .format(effect, players.length, preset, intensity, Math.ceil(durationMs / 1000));
  }
  return result;
}

CreatureHandler.prototype.getVipShowStatus = function () {
  let focus = this.__spotlightFocus;
  if (!focus || !focus.vipShow || focus.endsAt === null || focus.endsAt <= Date.now()) {
    return { ok: false, message: "No VIP show is currently running." };
  }
  return {
    ok: true,
    message: focus.vipShow.crowd
      ? "Crowd %s show in %s style has %s dancers and %s seconds remaining."
        .format(
          focus.vipShow.effect,
          focus.vipShow.preset,
          focus.vipShow.participants.length,
          Math.ceil((focus.endsAt - Date.now()) / 1000)
        )
      : "%s has the %s show in %s style for %s more seconds."
      .format(
        focus.targetName,
        focus.vipShow.effect,
        focus.vipShow.preset,
        Math.ceil((focus.endsAt - Date.now()) / 1000)
      )
  };
}

CreatureHandler.prototype.stopVipShow = function () {
  if (!this.__spotlightFocus || !this.__spotlightFocus.vipShow) {
    return { ok: false, message: "No VIP show is currently running." };
  }
  this.clearSpotlightFocus();
  return { ok: true, message: "VIP show stopped." };
}

CreatureHandler.prototype.startLaserShow = function (text, variant) {
  let mode = variant === 4
    ? "arcade"
    : (variant === 3
      ? "dimension"
    : (variant === 2
      ? "overdrive"
      : (typeof text === "string" && text.trim().length > 0 ? "text" : "default")));
  let normalizedText = mode === "text"
    ? text.trim().toUpperCase()
    : (mode === "arcade" ? "NEON ARCADE" : (mode === "dimension" ? "CYRK PARTY ZONE" : (mode === "overdrive" ? "PARTY ZONE" : "CYRK")));
  if (mode === "text" && normalizedText.length > LASER_SHOW_MAX_TEXT_LENGTH) {
    return { ok: false, message: "Laser show text can contain at most %s characters.".format(LASER_SHOW_MAX_TEXT_LENGTH) };
  }
  if (!/^[A-Z0-9 '!.-]+$/.test(normalizedText)) {
    return { ok: false, message: "Laser show text supports A-Z, 0-9, spaces, apostrophes, dots, dashes and exclamation marks." };
  }

  let now = Date.now();
  let visibleCharacters = normalizedText.replace(/\s/g, "").length;
  let durationMs = mode === "default"
    ? LASER_SHOW_DEFAULT_DURATION_MS
    : (mode === "overdrive"
      ? LASER_SHOW_OVERDRIVE_DURATION_MS
      : (mode === "dimension"
        ? LASER_SHOW_DIMENSION_DURATION_MS
        : (mode === "arcade"
          ? LASER_SHOW_ARCADE_DURATION_MS
          : 11000 + Math.max(1, visibleCharacters) * 1400)));
  this.__spotlightFocus = null;
  this.__laserShow = {
    mode: mode,
    text: normalizedText,
    startedAt: now,
    endsAt: now + durationMs
  };
  this.__resyncRadioAmbience();
  return {
    ok: true,
    message: mode === "default"
      ? "The 75-second CYRK laser show has started!"
      : (mode === "overdrive"
        ? "The 100-second NEON OVERDRIVE laser show has started!"
        : (mode === "dimension"
          ? "The 100-second CYRK DIMENSION laser show has started!"
          : (mode === "arcade"
            ? "The 100-second NEON ARCADE laser show has started!"
            : "Laser show is drawing '%s' for %s seconds.".format(normalizedText, Math.ceil(durationMs / 1000)))))
  };
}

CreatureHandler.prototype.stopLaserShow = function () {
  if (!this.__laserShow) {
    return { ok: false, message: "No laser show is currently running." };
  }
  let now = Date.now();
  this.__laserShow.endsAt = Math.min(this.__laserShow.endsAt, now + LASER_SHOW_OUTRO_MS);
  this.__resyncRadioAmbience();
  return { ok: true, message: "Laser show is finishing smoothly." };
}

CreatureHandler.prototype.getLaserShowStatus = function () {
  if (!this.__laserShow || this.__laserShow.endsAt <= Date.now()) {
    return { ok: false, message: "No laser show is currently running." };
  }
  return {
    ok: true,
    message: "Laser show '%s' has %s seconds remaining."
      .format(this.__laserShow.text, Math.ceil((this.__laserShow.endsAt - Date.now()) / 1000))
  };
}

CreatureHandler.prototype.__getLaserShowPayload = function () {
  let show = this.__laserShow;
  let now = Date.now();
  if (!show || show.endsAt <= now) return null;
  return {
    mode: show.mode,
    text: show.text,
    elapsedMs: Math.max(0, now - show.startedAt),
    durationMs: show.endsAt - show.startedAt
  };
}

CreatureHandler.prototype.celebratePartyWinner = function (player) {
  return this.focusSpotlightsOnPlayer(player, {
    durationMs: SPOTLIGHT_FOCUS_DURATION_MS,
    flashing: true,
    includeLasers: true,
    source: "floor-lava-winner"
  });
}

CreatureHandler.prototype.clearSpotlightFocus = function () {
  if (this.__spotlightFocus === null) {
    return { ok: false, message: "The spotlights are not following anyone." };
  }

  console.log("[SPOTLIGHT FOCUS] %s", JSON.stringify({
    action: "stop",
    source: this.__spotlightFocus.source,
    targetId: this.__spotlightFocus.targetId,
    targetName: this.__spotlightFocus.targetName
  }));
  this.__spotlightFocus = null;
  this.__resyncRadioAmbience();
  return { ok: true, message: "Spotlight focus stopped." };
}

CreatureHandler.prototype.__getSpotlightFocusPayload = function () {
  let focus = this.__spotlightFocus;
  let now = Date.now();
  if (!focus || (focus.endsAt !== null && focus.endsAt <= now) || !focus.target || !focus.target.position) {
    return null;
  }

  return {
    targetId: focus.targetId,
    targetName: focus.targetName,
    source: focus.source,
    targetPosition: {
      x: focus.target.position.x,
      y: focus.target.position.y,
      z: focus.target.position.z
    },
    elapsedMs: Math.max(0, now - focus.startedAt),
    persistent: focus.endsAt === null,
    durationMs: focus.endsAt === null ? null : focus.endsAt - focus.startedAt,
    flashDurationMs: focus.flashDurationMs,
    flashCount: focus.flashCount,
    includeLasers: focus.includeLasers === true,
    vipShow: focus.vipShow
      ? {
        effect: focus.vipShow.effect,
        preset: focus.vipShow.preset,
        intensity: focus.vipShow.intensity,
        crowd: focus.vipShow.crowd === true,
        participants: focus.vipShow.participants.filter(function (participant) {
          return participant.target
            && participant.target.position
            && (!(this.__creatureMap instanceof Map) || this.__creatureMap.has(participant.targetId));
        }, this).map(function (participant) {
          return {
            targetId: participant.targetId,
            targetName: participant.targetName,
            targetPosition: {
              x: participant.target.position.x,
              y: participant.target.position.y,
              z: participant.target.position.z
            }
          };
        })
      }
      : null
  };
}

CreatureHandler.prototype.getReadableContent = function (item) {

  /*
   * Resolves live text for the three party noticeboards. Every other readable
   * keeps the text stored in the map file.
   */

  let originalContent = item && typeof item.getContent === "function"
    ? item.getContent()
    : null;

  if (!item || typeof item.getPosition !== "function") {
    return originalContent;
  }

  let position = item.getPosition();
  if (!position) {
    return originalContent;
  }

  let formatter = PARTY_READABLE_POSITIONS[
    position.x + "," + position.y + "," + position.z
  ];

  if (!formatter) {
    return originalContent;
  }

  let onlinePlayers = this.getConnectedPlayers().size;
  return formatter(onlinePlayers, this.getPartyRadioPlayerCount());

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
      spotlightsEnabled: zone.spotlightsEnabled !== undefined
        ? zone.spotlightsEnabled === true
        : zone.discoCanvasEnabled === true,
      legacyLasersEnabled: zone.legacyLasersEnabled !== undefined
        ? zone.legacyLasersEnabled === true
        : zone.discoCanvasEnabled === true,
      discoCanvasIntensity: Number.isInteger(zone.discoCanvasIntensity) ? zone.discoCanvasIntensity : 60,
      spotlightSpeed: Number.isInteger(zone.spotlightSpeed) && zone.spotlightSpeed >= 0 && zone.spotlightSpeed <= 250 ? zone.spotlightSpeed : 100,
      spotlightFocus: this.__getSpotlightFocusPayload(),
      laserShow: this.__getLaserShowPayload(),
      chairGame: this.laserChairs ? this.laserChairs.getPayload() : null,
      partyFlow: this.partyGameFlow ? this.partyGameFlow.getPayload() : null,
      discoCanvasRadius: Number.isInteger(zone.radius) ? zone.radius : 0,
      discoCanvasCenter: zone.center || null,
      beatBpm: Number.isInteger(zone.beatBpm) ? zone.beatBpm : 0,
      rhythmMode: zone.rhythmMode === "fixed" ? "fixed" : "auto",
      bassSensitivity: Number.isInteger(zone.bassSensitivity) ? zone.bassSensitivity : 50,
      radioEnvironmentalMute: true
    }
    : { weather: "none", light: "none", discoCanvasEnabled: false, spotlightsEnabled: false, legacyLasersEnabled: false, discoCanvasIntensity: 60, spotlightSpeed: 100, spotlightFocus: null, laserShow: null, chairGame: null, partyFlow: null, discoCanvasRadius: 0, discoCanvasCenter: null, beatBpm: 0, rhythmMode: "auto", bassSensitivity: 50, radioEnvironmentalMute: false };
  let ambienceKey = this.__getRadioAmbienceKey(ambience);

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

  if (this.__spotlightFocus && this.__spotlightFocus.vipShow && this.__spotlightFocus.vipShow.crowd) {
    let wasInside = oldPosition ? this.isOnPartyDanceFloor(oldPosition) : false;
    let isInside = this.isOnPartyDanceFloor(player.position);
    if (wasInside !== isInside) this.__refreshCrowdShowParticipants();
  }

  if (oldZone && newZone && oldZone.id === newZone.id && Math.abs(oldState.volume - newState.volume) < 0.01) {
    return;
  }

  if (newZone && newZone.enabled) {
    let queuedTrack = this.partyRadioQueue.encodePlayback(newZone.id, Date.now());
    if (queuedTrack) {
      return player.write(new RadioStreamPacket(true, queuedTrack, newState.volume));
    }
    if (newZone.url) {
      return player.write(new RadioStreamPacket(true, newZone.url, newState.volume));
    }
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

CreatureHandler.prototype.announceNpcYell = function (npcName, message) {

  let normalizedName = String(npcName || "").toLowerCase();
  let npc = null;

  this.__creatureMap.forEach(function (creature) {
    if (
      npc !== null
      || creature.isPlayer()
      || !creature.getProperty
      || String(creature.getProperty(CONST.PROPERTIES.NAME) || "").toLowerCase() !== normalizedName
    ) {
      return;
    }

    npc = creature;
  });

  if (npc === null || typeof npc.getChunk !== "function") {
    return false;
  }

  let npcChunk = npc.getChunk();
  if (npcChunk === null) {
    return false;
  }

  let packet = new CreatureYellPacket(
    npc,
    String(message || "").toUpperCase(),
    CONST.COLOR.LIGHTBLUE
  );

  this.getConnectedPlayers().forEach(function (player) {
    let playerChunk = player.getChunk();
    if (
      playerChunk === null
      || Math.abs(playerChunk.position.x - npcChunk.position.x) > 2
      || Math.abs(playerChunk.position.y - npcChunk.position.y) > 2
    ) {
      return;
    }

    // Ensure the client knows the speaker before it receives the dedicated
    // yell packet, including players in the second neighbouring chunk ring.
    player.write(new CreatureStatePacket(npc));
    player.write(packet);
  });

  return true;

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

  this.clearPlayerTargetsForCreature(creature);

  // Delete the creature from the map
  this.__creatureMap.delete(creature.getId());

  // Clean up
  creature.cleanup();

  creature.broadcast(new CreatureForgetPacket(creature.getId()));

  // The death flow may already have released the creature's tile and chunk
  // while intentionally keeping its socket/player references alive.
  if (this.__detachedCreaturePositions.delete(creature)) {
    return;
  }

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

CreatureHandler.prototype.__getRadioAmbienceKey = function (ambience) {

  /*
   * Elapsed values are transport snapshots, not state changes. The client
   * keeps progressing timed shows from each snapshot plus receivedAt, so
   * including them made movement resend the full ambience packet.
   */

  return JSON.stringify(ambience, function (key, value) {
    return key === "elapsedMs" || key === "animationElapsedMs" ? undefined : value;
  });

}

CreatureHandler.prototype.detachCreaturePosition = function (creature) {
  if (!this.exists(creature) || this.__detachedCreaturePositions.has(creature)) {
    return false;
  }

  let chunk = creature.getChunk();
  let tile = creature.getTile();
  if (chunk === null || tile === null) return false;

  chunk.removeCreature(creature);
  tile.removeCreature(creature);
  tile.emit("exit", tile, creature);
  this.__detachedCreaturePositions.add(creature);
  return true;
};

CreatureHandler.prototype.isCreaturePositioned = function (creature) {
  if (
    !creature
    || !this.exists(creature)
    || this.__detachedCreaturePositions.has(creature)
    || !creature.position
  ) {
    return false;
  }

  return creature.getChunk() !== null && creature.getTile() !== null;
};

CreatureHandler.prototype.clearPlayerTargetsForCreature = function (creature) {

  /*
   * Clear every player target that references a creature which died, logged
   * out or was removed. This prevents stale attack boxes and queued hits.
   */

  this.__playerMap.forEach(function (player) {
    if (
      player !== creature &&
      player.getTarget &&
      player.getTarget() === creature &&
      player.actionHandler
    ) {
      player.actionHandler.targetHandler.setTarget(null);
    }
  });

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

  this.partyAchievements.preparePlayer(player);

  // Attempt to add the player to the position
  if (!this.addCreaturePosition(player, position)) {
    return false;
  }

  gameServer.world.broadcastPacket(new PlayerLoginPacket(player.getProperty(CONST.PROPERTIES.NAME)));

  // Save a reference to the character name so we can look it up by name
  this.__referencePlayer(player);

  // Late joiners and already eliminated players may not reconnect directly
  // onto the dance floor while a round is running.
  let floorLavaAudiencePosition = this.floorLava.handlePlayerConnected(player);
  if (floorLavaAudiencePosition !== null) {
    this.teleportCreature(
      player,
      floorLavaAudiencePosition,
      { ignoreFloorLava: true }
    );
  }

  let bombermanPosition = this.bomberman.handlePlayerConnected(player);
  if (bombermanPosition !== null) {
    this.teleportCreature(
      player,
      bombermanPosition,
      { ignoreBomberman: true }
    );
  }

  let laserChairsPosition = this.laserChairs.handlePlayerConnected(player);
  if (laserChairsPosition !== null) {
    this.teleportCreature(
      player,
      laserChairsPosition,
      { ignoreLaserChairs: true }
    );
  }

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
    this.__tickClubDrinkAuras();
    this.__refreshCrowdShowParticipants();
  }

  this.partyRadioQueue.tick(Date.now());
  this.__tickClubDance();
  if (this.__spotlightFocus && this.__spotlightFocus.endsAt !== null && this.__spotlightFocus.endsAt <= Date.now()) {
    this.__spotlightFocus = null;
    this.__resyncRadioAmbience();
  }

  if (this.__laserShow && this.__laserShow.endsAt <= Date.now()) {
    this.__laserShow = null;
    this.__resyncRadioAmbience();
  }
  this.partyAchievements.tick();
  this.floorLava.tick();
  this.bomberman.tick();
  this.laserChairs.tick();
  this.partyGameFlow.tick();
  if (this.partyBouncers) {
    this.partyBouncers.tick();
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

CreatureHandler.prototype.createNewPlayer = async function (gameSocket, data) {

  /*
   * Function CreatureHandler.createNewPlayer
   * Creates a new player and adds it to the game world
   */

  // Disco-only maps do not contain the historical temples. Keep every
  // existing character's respawn point valid; an out-of-crop saved position
  // will then fall back to this tile during login.
  let discoMode = CONFIG.SERVER.DISCO_MODE;
  if (discoMode && discoMode.ENABLED === true && discoMode.SPAWN) {
    data.templePosition = Position.prototype.fromLiteral(discoMode.SPAWN);
  }

  // Create the class that wraps the data
  let player = new Player(data);
  let position = Position.prototype.fromLiteral(data.position);

  try {
    await gameServer.world.combatHandler.getPvPManager().hydratePlayer(player);
  } catch (error) {
    console.error("Could not restore PvP state for %s:".format(player.name), error);
    return gameSocket.closeError("Your PvP state could not be loaded. Please try again.");
  }

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

  // The controller must exist before a newly earned login/visit achievement
  // can display its popup and sound on the client.
  this.partyAchievements.initializePlayer(player);

  // Send viewer-relative skulls after the controller can receive packets.
  gameServer.world.combatHandler.getPvPManager().broadcastSkullChanges();

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

  if (this.__spotlightFocus && this.__spotlightFocus.vipShow && this.__spotlightFocus.vipShow.crowd) {
    this.__refreshCrowdShowParticipants();
  }

  // A participant leaving the game must end a focused VIP sequence cleanly
  // for every remaining observer instead of leaving lights on a stale target.
  if (this.__spotlightFocus && this.__spotlightFocus.targetId === player.getId()
      && (!this.__spotlightFocus.vipShow || !this.__spotlightFocus.vipShow.crowd)) {
    this.clearSpotlightFocus();
  }

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

CreatureHandler.prototype.resyncPlayerWorld = function (player, reason) {

  /*
   * Function CreatureHandler.resyncPlayerWorld
   * Sends an authoritative snapshot of every visible chunk after a teleport
   * or a dynamic arena rebuild. The client replaces matching cached chunks,
   * which prevents invisible blockers and stale visual "ghost" items.
   */

  if (
    !player
    || typeof player.isPlayer !== "function"
    || !player.isPlayer()
    || typeof player.write !== "function"
    || !player.position
  ) {
    return 0;
  }

  let centerChunk = gameServer.world.getChunkFromWorldPosition(player.position);

  if (centerChunk === null) {
    return 0;
  }

  let visibleChunks = centerChunk.neighbours && centerChunk.neighbours.length > 0
    ? centerChunk.neighbours
    : [centerChunk];
  let sent = 0;
  let seen = new Set();

  visibleChunks.forEach(function (chunk) {
    if (!chunk || seen.has(chunk.id)) {
      return;
    }

    seen.add(chunk.id);
    player.write(new ChunkPacket(chunk));
    sent++;
  });

  // ChunkPacket intentionally contains only tiles and items. Finish an
  // authoritative refresh by re-anchoring every visible creature, otherwise
  // the browser can keep their pre-teleport tile references. Send self last:
  // handleSelfTeleport then rebuilds the camera/tile cache after every chunk
  // in this batch has already been installed.
  let visibleCreatures = new Map();
  let addCreatures = function (collection) {
    if (!collection || typeof collection.forEach !== "function") {
      return;
    }

    collection.forEach(function (creature) {
      if (!creature || typeof creature.getId !== "function") {
        return;
      }
      visibleCreatures.set(creature.getId(), creature);
    });
  };

  visibleChunks.forEach(function (chunk) {
    if (!chunk) {
      return;
    }
    addCreatures(chunk.players);
    addCreatures(chunk.npcs);
    addCreatures(chunk.monsters);
  });

  visibleCreatures.delete(player.getId());
  visibleCreatures.forEach(function (creature) {
    this.__writeCreatureReference(player, creature, true);
  }, this);
  player.write(new CreatureTeleportPacket(player.getId(), player.getPosition()));
  let anchoredCreatures = visibleCreatures.size + 1;

  if (reason && String(reason).startsWith("bomberman-")) {
    console.log("[WORLD RESYNC] %s".format(JSON.stringify({
      reason: reason,
      playerId: typeof player.getId === "function" ? player.getId() : null,
      chunks: sent,
      anchoredCreatures: anchoredCreatures,
      position: {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z
      }
    })));
  }

  return sent;

}

CreatureHandler.prototype.__writeCreatureReference = function (
  observer,
  creature,
  includeAnchor
) {
  if (!observer || !creature || typeof observer.write !== "function") {
    return false;
  }

  observer.write(new CreatureStatePacket(creature));

  if (
    creature.isPlayer && creature.isPlayer()
    && gameServer.world.combatHandler
  ) {
    let skull = gameServer.world.combatHandler
      .getPvPManager()
      .getSkullFor(observer, creature);
    observer.write(new CreatureSkullPacket(creature.getId(), skull));
  }

  if (includeAnchor === true) {
    observer.write(new CreatureTeleportPacket(
      creature.getId(),
      creature.getPosition()
    ));
  }

  return true;
}

CreatureHandler.prototype.__broadcastCreatureTeleport = function (creature) {
  let creatureChunk = creature && creature.getChunk ? creature.getChunk() : null;
  if (creatureChunk === null) {
    return false;
  }

  let observers = new Set();
  creatureChunk.neighbours.forEach(function (chunk) {
    chunk.players.forEach(function (player) {
      observers.add(player);
    });
  });

  observers.forEach(function (observer) {
    if (observer === creature) {
      observer.write(new CreatureTeleportPacket(
        creature.getId(),
        creature.getPosition()
      ));
      return;
    }

    this.__writeCreatureReference(observer, creature, true);
  }, this);

  return true;
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
  if (this.partyBouncers) {
    this.partyBouncers.handlePlayerMoved(creature);
  }

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

CreatureHandler.prototype.teleportCreature = function (creature, position, options) {

  /*
   * Function Creature.teleportCreature
   * Teleports a creature to a particular world position
   */

  options = options || {};

  if (creature.isPlayer() && options.ignoreFloorLava !== true) {
    let floorLavaRedirect = this.floorLava.handleDestination(creature, position);
    if (floorLavaRedirect !== null) {
      if (floorLavaRedirect.position === null) {
        return false;
      }
      position = floorLavaRedirect.position;
    }
  }

  if (creature.isPlayer() && options.ignoreBomberman !== true) {
    let bombermanRedirect = this.bomberman.handleDestination(creature, position);
    if (bombermanRedirect !== null) {
      if (bombermanRedirect.position === null) {
        return false;
      }
      position = bombermanRedirect.position;
    }
  }

  if (creature.isPlayer() && this.laserChairs && options.ignoreLaserChairs !== true) {
    let laserChairsRedirect = this.laserChairs.handleDestination(creature, position);
    if (laserChairsRedirect !== null) {
      if (laserChairsRedirect.position === null) {
        return false;
      }
      position = laserChairsRedirect.position;
    }
  }

  if (creature.isPlayer() && this.partyGameFlow && options.ignorePartyGameFlow !== true) {
    let partyFlowRedirect = this.partyGameFlow.handleDestination(creature, position);
    if (partyFlowRedirect !== null) {
      if (partyFlowRedirect.position === null) return false;
      position = partyFlowRedirect.position;
    }
  }

  let tile = gameServer.world.getTileFromWorldPosition(position);
  let oldPosition = creature.position;
  let oldTile = gameServer.world.getTileFromWorldPosition(oldPosition);

  // Not possible
  if (tile === null) {
    return false;
  }

  if (
    creature.isPlayer() &&
    options.ignorePvpLock !== true &&
    tile.isProtectionZone() &&
    gameServer.world.combatHandler.getPvPManager().isPzLocked(creature)
  ) {
    creature.sendCancelMessage("You may not enter a protection zone after attacking another player.");
    return false;
  }

  // Find the destination through other portals etc..
  let destination = gameServer.world.lattice.findDestination(creature, tile);

  if (destination === null) {
    destination = creature;
  }

  let destinationTile = gameServer.world.getTileFromWorldPosition(destination.position);
  if (
    creature.isPlayer() &&
    options.ignorePvpLock !== true &&
    destinationTile && destinationTile.isProtectionZone() &&
    gameServer.world.combatHandler.getPvPManager().isPzLocked(creature)
  ) {
    creature.sendCancelMessage("You may not enter a protection zone after attacking another player.");
    return false;
  }

  // Try to set the position: it may fail however
  this.updateCreaturePosition(creature, destination.position);

  // A destination observer may never have seen this creature ID before (for
  // example after death/reconnect). Always introduce it before its teleport
  // anchor instead of sending an anchor the client cannot resolve.
  this.__broadcastCreatureTeleport(creature);

  // A teleport may remain inside the same chunk, and dynamic party-game
  // objects may have changed while the browser was switching positions.
  // Always follow the teleport packet with an authoritative visible-world
  // snapshot so the client cannot keep stale walls or miss new obstacles.
  if (creature.isPlayer() && options.resyncWorld !== false) {
    this.resyncPlayerWorld(creature, options.resyncReason || "teleport");
  }

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

  if (creature.isPlayer() && this.partyBouncers) {
    let bouncerDecision = this.partyBouncers.handleDestination(creature, position);
    if (bouncerDecision === false) {
      return false;
    }
  }

  if (creature.isPlayer()) {
    let floorLavaRedirect = this.floorLava.handleDestination(creature, position);

    if (floorLavaRedirect !== null) {
      if (floorLavaRedirect.position === null) {
        return false;
      }

      return this.teleportCreature(
        creature,
        floorLavaRedirect.position,
        { ignoreFloorLava: true }
      );
    }
  }

  if (creature.isPlayer()) {
    let bombermanRedirect = this.bomberman.handleDestination(creature, position);

    if (bombermanRedirect !== null) {
      if (bombermanRedirect.position === null) {
        return false;
      }

      return this.teleportCreature(
        creature,
        bombermanRedirect.position,
        { ignoreBomberman: true }
      );
    }
  }

  if (creature.isPlayer() && this.laserChairs) {
    let laserChairsRedirect = this.laserChairs.handleDestination(creature, position);

    if (laserChairsRedirect !== null) {
      if (laserChairsRedirect.position === null) {
        return false;
      }

      return this.teleportCreature(
        creature,
        laserChairsRedirect.position,
        { ignoreLaserChairs: true }
      );
    }
  }

  if (creature.isPlayer() && this.partyGameFlow) {
    let partyFlowRedirect = this.partyGameFlow.handleDestination(creature, position);
    if (partyFlowRedirect !== null) {
      if (partyFlowRedirect.position === null) return false;
      return this.teleportCreature(
        creature,
        partyFlowRedirect.position,
        { ignorePartyGameFlow: true }
      );
    }
  }

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

  if (
    creature.isPlayer() &&
    tile.isProtectionZone() &&
    gameServer.world.combatHandler.getPvPManager().isPzLocked(creature)
  ) {
    creature.sendCancelMessage("You may not enter a protection zone after attacking another player.");
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
