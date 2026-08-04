"use strict";

const path = require("path");
const Position = requireModule("utils/position");
const NPC = requireModule("npc/npc");
const { ServerMessagePacket, CreaturePropertyPacket, RadioStreamPacket } = requireModule("network/protocol");

const CommandHandler = function () { };

CommandHandler.prototype.WAYPOINTS = new Object({
  rookgaard: new Position(32097, 32219, 7),
  thais: new Position(32369, 32241, 7),
  carlin: new Position(32360, 31782, 7),
  "ab'dendriel": new Position(32732, 31634, 7),
  venore: new Position(32957, 32076, 7),
  poh: new Position(32816, 32260, 9),
  "gm-island": new Position(32316, 31942, 7),
  senja: new Position(32125, 31667, 7),
  dracona: new Position(32804, 31586, 14),
  "orc-fortress": new Position(32882, 31772, 8),
  edron: new Position(33217, 31814, 7),
  kazordoon: new Position(32649, 31925, 3),
  ankrahmun: new Position(33194, 32853, 7),
  darama: new Position(33213, 32454, 13),
  cormaya: new Position(33301, 31968, 7),
  disco: new Position(32515, 32375, 7),
  fibula: new Position(32174, 32437, 7),
  "white-flower": new Position(32346, 32362, 8),
  "femur-hills": new Position(32536, 31837, 10),
  "ghost-ship": new Position(33321, 32181, 7),
  mintwallin: new Position(32456, 32100, 1),
  cyclopolis: new Position(33251, 31695, 7),
  annihilator: new Position(33221, 31671, 1),
});

CommandHandler.prototype.handleCommandWaypoint = function (player, waypoint) {
  /*
   * CommandHandler.handleCommandWaypoint
   * Executes the waypoint command
   */

  if (!this.WAYPOINTS.hasOwnProperty(waypoint)) {
    return player.sendCancelMessage("This waypoint does not exist.");
  }

  return gameServer.world.creatureHandler.teleportCreature(
    player,
    this.WAYPOINTS[waypoint]
  );
};

CommandHandler.prototype.handleCommandTeleport = function (player, coordinates) {
  /*
   * CommandHandler.handleCommandTeleport
   * Teleports a GM to an exact world position.
   */

  let x = Number(coordinates[0]);
  let y = Number(coordinates[1]);
  let z = Number(coordinates[2]);

  if (
    coordinates.length !== 3 ||
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    !Number.isInteger(z) ||
    x < 0 ||
    x > 65535 ||
    y < 0 ||
    y > 65535 ||
    z < 0 ||
    z > 15
  ) {
    return player.sendCancelMessage("Usage: /teleport X Y Z");
  }

  let destination = new Position(x, y, z);

  if (!gameServer.world.getTileFromWorldPosition(destination)) {
    return player.sendCancelMessage("There is no valid tile at that destination.");
  }

  let teleported = gameServer.world.creatureHandler.teleportCreature(
    player,
    destination,
    {
      ignoreFloorLava: true,
      ignoreBomberman: true,
      ignoreLaserChairs: true,
    }
  );

  if (!teleported) {
    return player.sendCancelMessage("Could not teleport to that destination.");
  }

  return player.sendCancelMessage(
    "Teleported to " + x + ", " + y + ", " + z + "."
  );
};

CommandHandler.prototype.handleCommandAdvance = function (player, amount) {
  /*
   * CommandHandler.handleCommandAdvance
   * Teleports a GM forward by the requested number of SQMs.
   */

  let distance = Number(amount);

  if (!Number.isInteger(distance) || distance < 1 || distance > 50) {
    return player.sendCancelMessage("Usage: /a [1-50]");
  }

  let direction = player.getProperty(CONST.PROPERTIES.DIRECTION);
  let destination = player.getPosition();

  for (let step = 0; step < distance; step++) {
    destination = destination.getPositionFromDirection(direction);

    if (destination === null) {
      return player.sendCancelMessage("Your current direction is invalid.");
    }
  }

  if (!gameServer.world.getTileFromWorldPosition(destination)) {
    return player.sendCancelMessage("There is no valid tile at that destination.");
  }

  return gameServer.world.creatureHandler.teleportCreature(player, destination);
};

CommandHandler.prototype.handleCommandRestart = function (player, value) {
  /*
   * CommandHandler.handleCommandRestart
   * Schedules a graceful server restart for GM/GOD accounts.
   */

  let seconds = value === undefined ? 10 : Number(value);

  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 300) {
    return player.sendCancelMessage("Usage: /restart [seconds from 1 to 300]");
  }

  if (!gameServer.scheduleRestart(seconds * 1000)) {
    return player.sendCancelMessage(
      "The server is already shutting down or restarting."
    );
  }

  return player.sendCancelMessage(
    "Server restart scheduled in " + seconds + " seconds."
  );
};

CommandHandler.prototype.handleCommandTime = function (player, value) {
  /*
   * CommandHandler.handleCommandTime
   * Changes the global world time or reports the current clock state.
   */

  let clock = gameServer.world.clock;

  if (value === "status") {
    let speed = CONFIG.WORLD.CLOCK.SPEED;
    let realDayMinutes = (24 * 60) / speed;
    let duration = Number.isInteger(realDayMinutes)
      ? realDayMinutes + " real minutes"
      : realDayMinutes.toFixed(1) + " real minutes";

    return player.sendCancelMessage(
      "World time: " + clock.getTimeString() +
      ". Clock speed: " + speed + "x (full day: " + duration + ")."
    );
  }

  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return player.sendCancelMessage("Usage: /time HH:MM or /time status");
  }

  clock.changeTime(value);
  return player.sendCancelMessage("World time set to " + value + ".");
};

CommandHandler.prototype.handleCommandAddSkill = function (
  player,
  skill,
  amount
) {
  if (skill === "level") {
    try {
      // Obter exp atual do objeto skills
      const currentExp = player.skills.experience || 0;
      const currentLevel = Math.floor(currentExp / 100) + 1;
      const targetLevel = currentLevel + Number(amount);


      // Calcular exp necessária
      const Skill = requireModule("utils/skill");
      const skillInstance = new Skill();
      const targetExp = skillInstance.getExperience(targetLevel);
      const currentLevelExp = skillInstance.getExperience(currentLevel);
      const expRequired = targetExp - currentLevelExp;


      // Recalcular atributos baseados no novo level
      const newHealth = 150 + (targetLevel - 1) * 5;
      const newMana = 35 + (targetLevel - 1) * 5;
      const newCap = 400 + (targetLevel - 1) * 10;

      // Atualizar o player em tempo real usando as constantes corretas
      // Primeiro setamos o MAX, depois o atual
      player.setProperty(2, newHealth); // MAX_HEALTH primeiro
      player.setProperty(1, newHealth); // HEALTH depois
      player.setProperty(4, newMana); // MAX_MANA primeiro
      player.setProperty(3, newMana); // MANA depois
      player.setProperty(5, newCap); // CAPACITY

      // Atualizar os valores no objeto properties
      if (player.properties) {
        player.properties.health = newHealth;
        player.properties.maxHealth = newHealth;
        player.properties.mana = newMana;
        player.properties.maxMana = newMana;
        player.properties.capacity = newCap;
      }

      // Salvar no banco de dados
      if (player.socketHandler && player.socketHandler.account) {
        // Criar um objeto com os dados atualizados
        const characterData = {
          position: {
            x: player.position.x,
            y: player.position.y,
            z: player.position.z,
          },
          skills: {
            magic: player.skills.magic || 0,
            fist: player.skills.fist || 10,
            club: player.skills.club || 10,
            sword: player.skills.sword || 10,
            axe: player.skills.axe || 10,
            distance: player.skills.distance || 10,
            shielding: player.skills.shielding || 10,
            fishing: player.skills.fishing || 10,
            experience: currentExp + expRequired,
          },
          properties: {
            name: player.properties.name,
            health: newHealth,
            mana: newMana,
            maxHealth: newHealth,
            maxMana: newMana,
            capacity: newCap,
            speed: player.properties.speed,
            defense: player.properties.defense,
            attack: player.properties.attack,
            attackSpeed: player.properties.attackSpeed,
            direction: player.properties.direction,
            outfit: player.properties.outfit,
            role: player.properties.role,
            vocation: player.properties.vocation,
            sex: player.properties.sex,
            availableMounts: player.properties.availableMounts,
            availableOutfits: player.properties.availableOutfits,
          },
          lastVisit: Date.now(),
          containers: player.containers,
          spellbook: player.spellbook,
          friends: player.friends,
          templePosition: {
            x: player.templePosition.x,
            y: player.templePosition.y,
            z: player.templePosition.z,
          },
        };

        // Atualizar o player em memória
        player.skills = characterData.skills;
        player.properties = characterData.properties;

        // Send packets to update client UI immediately
        const newExp = currentExp + expRequired;
        player.write(new CreaturePropertyPacket(player.getId(), CONST.PROPERTIES.EXPERIENCE, newExp));
        player.write(new CreaturePropertyPacket(player.getId(), CONST.PROPERTIES.HEALTH_MAX, newHealth));
        player.write(new CreaturePropertyPacket(player.getId(), CONST.PROPERTIES.HEALTH, newHealth));
        player.write(new CreaturePropertyPacket(player.getId(), CONST.PROPERTIES.MANA_MAX, newMana));
        player.write(new CreaturePropertyPacket(player.getId(), CONST.PROPERTIES.MANA, newMana));
        player.write(new CreaturePropertyPacket(player.getId(), CONST.PROPERTIES.CAPACITY, newCap));
        player.write(new CreaturePropertyPacket(player.getId(), CONST.PROPERTIES.CAPACITY_MAX, newCap));

        const AccountDatabase = requireModule("auth/account-database");
        const db = new AccountDatabase();

        // Create a mock gameSocket object to use saveCharacter
        const mockGameSocket = {
          player: player,
          account: player.socketHandler.account
        };

        // Use the saveCharacter method
        db.saveCharacter(mockGameSocket, function (error) {
          if (error) {
            console.error("[AddSkill] Error saving to database:", error);
          } else {
            console.log("[AddSkill] Character saved successfully to database");
          }
        });
      }

      // Notificar o cliente sobre as mudanças
      return player.sendCancelMessage(
        `Added ${expRequired} exp (${amount} levels). New level: ${targetLevel}`
      );
    } catch (error) {
      console.error("[AddSkill] Error:", error);
      return gameServer.world.broadcastPacket(
        new ServerMessagePacket("An error occurred while adding experience.")
      );
    }
  }

  return gameServer.world.broadcastPacket(
    new ServerMessagePacket("Invalid skill type. Available: level")
  );
};

CommandHandler.prototype.handleCommandRadio = function (player, message) {

  /*
   * Opens or saves the GM radio-zone editor. A zone is centered on the tile
   * where the command is used, making it easy to configure a house or venue.
   */

  if (!player.isGM()) {
    return player.sendCancelMessage("Only GMs can configure radio zones.");
  }

  if (message[1] !== "set") {
    let config = gameServer.world.creatureHandler.getRadioZoneEditorConfig(player.position);
    let editorPayload = encodeURIComponent(JSON.stringify(config));
    return player.write(new RadioStreamPacket(true, "radio-editor:" + editorPayload, 0));
  }

  let url = message[2] || "";
  let radius = Number(message[3]);
  let fadeRadius = Number(message[4]);
  let effectsEnabled = message[5] !== "0";
  let effectStyles = (message[6] || "disco").split(",");
  let effectInterval = Number(message[7]);
  let effectIntensity = Number(message[8]);
  let beatBpm = Number(message[9]);
  let weather = message[10] || "none";
  let light = message[11] || "none";
  let spotlightsEnabled = message[12] === "1";
  let legacyLasersEnabled;
  let discoCanvasIntensity;
  let spotlightSpeed;

  // Cached clients still send the former aggregate checkbox followed by the
  // intensity. Treat it as enabling both effects until they refresh.
  if (message[14] === undefined) {
    legacyLasersEnabled = spotlightsEnabled;
    discoCanvasIntensity = message[13] === undefined ? 60 : Number(message[13]);
    spotlightSpeed = 100;
  } else {
    legacyLasersEnabled = message[13] === "1";
    discoCanvasIntensity = Number(message[14]);
    spotlightSpeed = message[15] === undefined ? 100 : Number(message[15]);
  }
  let validEffectStyles = ["disco", "magic", "rings", "fire", "energy", "poison", "death", "teleport", "blood", "lightning"];
  let validWeather = ["none", "rain", "fog", "storm", "snow", "sandstorm", "ash", "embers"];
  let validLight = ["none", "night", "blue", "purple", "red"];

  try {
    let parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch (error) {
    return player.sendCancelMessage("Enter a valid http:// or https:// radio URL.");
  }

  if (!Number.isInteger(radius) || radius < 0 || radius > 50) {
    return player.sendCancelMessage("Radius must be a whole number from 0 to 50.");
  }

  if (!Number.isInteger(fadeRadius) || fadeRadius < 0 || fadeRadius > 50) {
    return player.sendCancelMessage("Radius Effect must be a whole number from 0 to 50.");
  }

  if (effectStyles.length === 0 || effectStyles.some(function (style) {
    return validEffectStyles.indexOf(style) === -1;
  })) {
    return player.sendCancelMessage("Choose one or more valid disco effect styles.");
  }

  if (!Number.isFinite(effectInterval) || effectInterval < 0.5 || effectInterval > 30) {
    return player.sendCancelMessage("Effect frequency must be from 0.5 to 30 seconds.");
  }

  if (!Number.isInteger(effectIntensity) || effectIntensity < 1 || effectIntensity > 12) {
    return player.sendCancelMessage("Effect intensity must be a whole number from 1 to 12.");
  }

  if (!Number.isInteger(beatBpm) || (beatBpm !== 0 && (beatBpm < 40 || beatBpm > 240))) {
    return player.sendCancelMessage("Beat BPM must be 0 or a whole number from 40 to 240.");
  }

  if (validWeather.indexOf(weather) === -1 || validLight.indexOf(light) === -1) {
    return player.sendCancelMessage("Choose valid radio weather and lighting options.");
  }

  if (!Number.isInteger(discoCanvasIntensity) || discoCanvasIntensity < 10 || discoCanvasIntensity > 100) {
    return player.sendCancelMessage("Canvas disco intensity must be a whole number from 10 to 100.");
  }

  if (!Number.isInteger(spotlightSpeed) || spotlightSpeed < 0 || spotlightSpeed > 250 || spotlightSpeed % 5 !== 0) {
    return player.sendCancelMessage("Spotlight speed must be from 0% to 250% in steps of 5%.");
  }

  if (!gameServer.world.creatureHandler.setRadioZoneAt(
    player.position,
    url,
    radius,
    fadeRadius,
    effectsEnabled,
    effectStyles,
    Math.round(effectInterval * 1000),
    effectIntensity,
    beatBpm,
    weather,
    light,
    spotlightsEnabled,
    legacyLasersEnabled,
    discoCanvasIntensity,
    spotlightSpeed,
    player.getProperty(CONST.PROPERTIES.NAME)
  )) {
    return player.sendCancelMessage("Could not save the radio zone.");
  }

  return player.write(new ServerMessagePacket("Radio zone saved. Base volume: 75%."));

};

CommandHandler.prototype.handleCommandFloorLava = function (player, message) {

  let action = (message[1] || "status").toLowerCase();
  let result;

  if (action === "start") {
    result = gameServer.world.creatureHandler.floorLava.start();
  } else if (action === "stop") {
    result = gameServer.world.creatureHandler.floorLava.stop();
  } else if (action === "status") {
    return player.sendCancelMessage(
      gameServer.world.creatureHandler.floorLava.getStatus()
    );
  } else {
    return player.sendCancelMessage("Usage: /lava start, /lava stop or /lava status.");
  }

  if (!result.ok) {
    return player.sendCancelMessage(result.message);
  }

  return true;

};

CommandHandler.prototype.handleCommandBomberman = function (player, message) {

  let action = (message[1] || "status").toLowerCase();
  let result;

  if (action === "start") {
    result = gameServer.world.creatureHandler.bomberman.start(message[2]);
  } else if (action === "stop") {
    result = gameServer.world.creatureHandler.bomberman.stop();
  } else if (action === "status") {
    return player.sendCancelMessage(
      gameServer.world.creatureHandler.bomberman.getStatus()
    );
  } else {
    return player.sendCancelMessage(
      "Usage: /bomber start [mayhem|elimination], /bomber stop or /bomber status."
    );
  }

  if (!result.ok) {
    return player.sendCancelMessage(result.message);
  }

  return true;

};

CommandHandler.prototype.handleCommandLaserChairs = function (player, message) {

  let action = (message[1] || "start").toLowerCase();
  let result;

  if (action === "start") {
    result = gameServer.world.creatureHandler.laserChairs.start();
  } else if (action === "stop") {
    result = gameServer.world.creatureHandler.laserChairs.stop();
  } else if (action === "status") {
    return player.sendCancelMessage(gameServer.world.creatureHandler.laserChairs.getStatus());
  } else {
    return player.sendCancelMessage("Usage: /chair [start|stop|status] or /chairs [start|stop|status].");
  }

  if (!result.ok) return player.sendCancelMessage(result.message);
  return true;

};

CommandHandler.prototype.handleCommandSpotlight = function (player, message) {
  let command = message[0] === "/spotlights" ? "/spotlights" : "/spotlight";
  let includeLasers = command === "/spotlights";
  let argumentsList = message.slice(1).filter(function (entry) { return entry.length > 0; });
  let targetName = argumentsList.join(" ").trim();

  if (!targetName) {
    return player.sendCancelMessage("Usage: %s Player Name [seconds] or %s off.".format(command, command));
  }

  if (targetName.toLowerCase() === "off") {
    let stopped = gameServer.world.creatureHandler.clearSpotlightFocus();
    return player.sendCancelMessage(stopped.message);
  }

  let durationMs = null;
  let finalArgument = argumentsList.at(-1);
  if (argumentsList.length > 1 && /^\d+$/.test(finalArgument)) {
    let durationSeconds = Number(finalArgument);
    if (!Number.isSafeInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 86400) {
      return player.sendCancelMessage("Spotlight time must be from 1 to 86400 seconds.");
    }
    durationMs = durationSeconds * 1000;
    argumentsList.pop();
    targetName = argumentsList.join(" ").trim();
  }

  let found = this.findCreatureByName(targetName);
  if (!found.target || typeof found.target.is !== "function" || !found.target.is("Player")) {
    return player.sendCancelMessage("That player is not online.");
  }

  let result = gameServer.world.creatureHandler.focusSpotlightsOnPlayer(found.target, {
    durationMs: durationMs,
    flashing: false,
    includeLasers: includeLasers,
    source: "gm-command"
  });
  return player.sendCancelMessage(result.message);
};

CommandHandler.prototype.handleCommandLaserShow = function (player, message) {
  let action = (message[1] || "").toLowerCase();
  let handler = gameServer.world.creatureHandler;
  let result;

  if (!action) {
    result = handler.startLaserShow(null, 1);
  } else if (action === "1") {
    result = handler.startLaserShow(null, 1);
  } else if (action === "2") {
    result = handler.startLaserShow(null, 2);
  } else if (action === "3") {
    result = handler.startLaserShow(null, 3);
  } else if (action === "4") {
    result = handler.startLaserShow(null, 4);
  } else if (action === "off") {
    result = handler.stopLaserShow();
  } else if (action === "status") {
    result = handler.getLaserShowStatus();
  } else if (action === "text") {
    let text = message.slice(2).join(" ").trim();
    if (!text) {
      return player.sendCancelMessage("Usage: /lasershow text YOUR TEXT");
    }
    result = handler.startLaserShow(text);
  } else {
    result = handler.startLaserShow(message.slice(1).join(" "));
  }

  return player.sendCancelMessage(result.message);
};

CommandHandler.prototype.handleCommandVipShow = function (player, message) {
  let argumentsList = message.slice(1).filter(function (entry) { return entry.length > 0; });
  let handler = gameServer.world.creatureHandler;
  let action = (argumentsList[0] || "").toLowerCase();

  if (!action) {
    return player.sendCancelMessage(
      "Usage: /show Player Name [effect] [preset] [intensity], /show crowd [...], /show status or /show stop."
    );
  }
  if (action === "off" || action === "stop") {
    return player.sendCancelMessage(handler.stopVipShow().message);
  }
  if (action === "status") {
    return player.sendCancelMessage(handler.getVipShowStatus().message);
  }
  if (action === "help" || action === "effects") {
    return player.sendCancelMessage(
      "Show effects: laser, hologram, wings, equalizer, vortex, portal, comet, rewind, helix, pixel, soundwave, cage, duel, discoball, constellation, combo, name, circuit and all. Example: /show crowd circuit fire intense."
    );
  }

  let presets = new Set(["rainbow", "fire", "ice", "toxic", "romance"]);
  let intensities = new Set(["soft", "normal", "intense"]);
  let effects = new Set([
    "laser", "hologram", "wings", "equalizer", "vortex", "portal", "comet",
    "rewind", "helix", "pixel", "soundwave", "cage", "duel", "discoball",
    "constellation", "combo", "name", "circuit", "all"
  ]);
  let aliases = new Map([
    ["holograms", "hologram"], ["comets", "comet"], ["pixels", "pixel"],
    ["sound", "soundwave"], ["wave", "soundwave"], ["disco", "discoball"],
    ["freeze", "rewind"], ["dna", "helix"], ["electric", "cage"],
    ["grid", "circuit"], ["livingcircuit", "circuit"]
  ]);
  let effect = "laser";
  let preset = "rainbow";
  let intensity = "normal";
  let finalArgument = (argumentsList.at(-1) || "").toLowerCase();

  if (intensities.has(finalArgument)) {
    intensity = finalArgument;
    argumentsList.pop();
    finalArgument = (argumentsList.at(-1) || "").toLowerCase();
  }
  if (presets.has(finalArgument)) {
    preset = finalArgument;
    argumentsList.pop();
    finalArgument = (argumentsList.at(-1) || "").toLowerCase();
  }
  if (aliases.has(finalArgument)) {
    effect = aliases.get(finalArgument);
    argumentsList.pop();
  } else if (effects.has(finalArgument)) {
    effect = finalArgument;
    argumentsList.pop();
  }

  let targetName = argumentsList.join(" ").trim();
  if (!targetName) {
    return player.sendCancelMessage("Enter the player name after /show.");
  }

  if (targetName.toLowerCase() === "crowd") {
    return player.sendCancelMessage(
      handler.startCrowdShow(effect, preset, intensity).message
    );
  }

  let found = this.findCreatureByName(targetName);
  if (!found.target || typeof found.target.is !== "function" || !found.target.is("Player")) {
    return player.sendCancelMessage("That player is not online.");
  }

  return player.sendCancelMessage(
    handler.startVipShow(found.target, effect, preset, intensity).message
  );
};

CommandHandler.prototype.handleCommandBomb = function (player) {

  let result = gameServer.world.creatureHandler.bomberman.placeBomb(player);

  if (!result.ok) {
    return player.sendCancelMessage(result.message);
  }

  return true;

};

CommandHandler.prototype.handleCommandAchievements = function (player) {
  let system = gameServer.world.creatureHandler.partyAchievements;
  if (!system) return player.sendCancelMessage("Party achievements are unavailable.");
  return system.open(player);
};

CommandHandler.prototype.handleCommandTitle = function (player, message) {
  let system = gameServer.world.creatureHandler.partyAchievements;
  if (!system) return player.sendCancelMessage("Party achievements are unavailable.");
  let requestedTitle = message.slice(1).join(" ").trim();
  if (!requestedTitle) {
    return player.sendCancelMessage("Usage: /title Title Name or /title none.");
  }
  let result = system.setTitle(player, requestedTitle);
  player.sendCancelMessage(result.message);
  if (result.ok) system.open(player);
  return result.ok;
};

CommandHandler.prototype.handleCommandBouncers = function (player, message) {
  let action = String(message[1] || "status").toLowerCase();
  let bouncers = gameServer.world.creatureHandler.partyBouncers;

  if (action === "status") {
    return player.sendCancelMessage(bouncers.getStatus(player));
  }

  if (action === "language") {
    let languageResult = bouncers.setPlayerLanguage(player, message[2]);
    player.sendCancelMessage(languageResult.message);
    return languageResult.ok;
  }

  let value = action === "password"
    ? message.slice(2).join(" ")
    : message[2];
  let result = bouncers.setMode(action, value);
  player.sendCancelMessage(result.message);
  return result.ok;
};

CommandHandler.prototype.handleCommandAddSkill = function (
  player,
  skill,
  amount
) {
  if (skill !== "level") {
    return player.sendCancelMessage("Invalid skill type. Available: level");
  }

  try {
    const levelAmount = Number(amount);

    if (!Number.isInteger(levelAmount) || levelAmount <= 0) {
      return player.sendCancelMessage("Usage: /addskill level [positive_amount]");
    }

    const Skill = requireModule("utils/skill");
    const experienceSkill = new Skill(CONST.PROPERTIES.EXPERIENCE, 0);
    const currentExp = player.skills.getSkillValue(CONST.PROPERTIES.EXPERIENCE) || 0;
    const currentLevel = player.skills.getSkillLevel(CONST.PROPERTIES.EXPERIENCE) || 1;
    const targetLevel = currentLevel + levelAmount;

    if (targetLevel > 1000) {
      return player.sendCancelMessage("Maximum level for /addskill is 1000.");
    }

    const targetExp = experienceSkill.getExperience(targetLevel);
    const expRequired = targetExp - currentExp;

    if (expRequired <= 0) {
      return player.sendCancelMessage("You already have enough experience for that level.");
    }

    player.skills.incrementSkill(CONST.PROPERTIES.EXPERIENCE, expRequired);

    const newHealth = player.getProperty(CONST.PROPERTIES.HEALTH_MAX);
    const newMana = player.getProperty(CONST.PROPERTIES.MANA_MAX);
    const newCap = player.getProperty(CONST.PROPERTIES.CAPACITY_MAX);
    const newSpeed = player.getSpeed();

    player.setProperty(CONST.PROPERTIES.HEALTH, newHealth);
    player.setProperty(CONST.PROPERTIES.MANA, newMana);
    player.setProperty(CONST.PROPERTIES.CAPACITY, newCap);
    player.setProperty(CONST.PROPERTIES.SPEED, newSpeed);

    player.write(new CreaturePropertyPacket(player.getId(), CONST.PROPERTIES.HEALTH, newHealth));
    player.write(new CreaturePropertyPacket(player.getId(), CONST.PROPERTIES.MANA, newMana));
    player.write(new CreaturePropertyPacket(player.getId(), CONST.PROPERTIES.CAPACITY, newCap));
    player.write(new CreaturePropertyPacket(player.getId(), CONST.PROPERTIES.SPEED, newSpeed));

    if (player.socketHandler && player.socketHandler.account) {
      const AccountDatabase = requireModule("auth/account-database");
      const db = new AccountDatabase();

      db.saveCharacter({
        player: player,
        account: player.socketHandler.account
      }, function (error) {
        if (error) {
          console.error("[AddSkill] Error saving to database:", error);
        } else {
          console.log("[AddSkill] Character saved successfully to database");
        }
      });
    }

    return player.sendCancelMessage(
      `Added ${expRequired} exp (${levelAmount} levels). New level: ${targetLevel}`
    );
  } catch (error) {
    console.error("[AddSkill] Error:", error);
    return player.sendCancelMessage("An error occurred while adding experience.");
  }
};

CommandHandler.prototype.findCreatureByName = function (name) {
  /*
   * CommandHandler.findCreatureByName
   * Finds an online creature by exact case-insensitive name.
   */

  let normalizedName = (name || "").toLowerCase();
  let target = null;
  let targetName = "";
  let found = false;

  gameServer.world.creatureHandler.__creatureMap.forEach(function (creature) {
    if (found) return;

    let creatureName = creature.getProperty(CONST.PROPERTIES.NAME);
    if (creatureName && creatureName.toLowerCase() === normalizedName) {
      target = creature;
      targetName = creatureName;
      found = true;
    }
  });

  return { target, targetName };
};

CommandHandler.prototype.handle = function (player, message) {
  message = message.split(" ");

  // /bomb is deliberately available to regular players during Bomberman.
  if (message[0] === "/bomb") {
    return this.handleCommandBomb(player);
  }

  // Party collections and title selection are available to every player.
  if (message[0] === "/achievements") {
    return this.handleCommandAchievements(player);
  }

  if (message[0] === "/title") {
    return this.handleCommandTitle(player, message);
  }

  // Slash commands in this handler are administrative tools (spawning,
  // teleporting, editing radio zones, and similar). They must not be exposed
  // to regular player accounts.
  if (!player.isGM()) {
    return player.sendCancelMessage("Only GMs can use game master commands.");
  }

  if (message[0] === "/property") {
    return player.setProperty(Number(message[1]), Number(message[2]));
  }

  if (message[0] === "/waypoint") {
    return this.handleCommandWaypoint(player, message[1]);
  }

  if (message[0] === "/radio") {
    return this.handleCommandRadio(player, message);
  }

  if (message[0] === "/lava") {
    return this.handleCommandFloorLava(player, message);
  }

  if (message[0] === "/bomber") {
    return this.handleCommandBomberman(player, message);
  }

  if (message[0] === "/chair" || message[0] === "/chairs") {
    return this.handleCommandLaserChairs(player, message);
  }

  if (message[0] === "/spotlight" || message[0] === "/spotlights") {
    return this.handleCommandSpotlight(player, message);
  }

  if (message[0] === "/lasershow") {
    return this.handleCommandLaserShow(player, message);
  }

  if (message[0] === "/show") {
    return this.handleCommandVipShow(player, message);
  }

  if (message[0] === "/bouncers") {
    return this.handleCommandBouncers(player, message);
  }

  if (message[0] === "/teleport") {
    return this.handleCommandTeleport(player, message.slice(1));
  }

  if (message[0] === "/a") {
    return this.handleCommandAdvance(player, message[1]);
  }

  if (message[0] === "/restart") {
    return this.handleCommandRestart(player, message[1]);
  }

  if (message[0] === "/time") {
    return this.handleCommandTime(player, message[1]);
  }

  if (message[0] === "/day") {
    return this.handleCommandTime(player, "15:00");
  }

  if (message[0] === "/night") {
    return this.handleCommandTime(player, "03:00");
  }

  if (message[0] === "/broadcast") {
    return gameServer.world.broadcastPacket(
      new ServerMessagePacket(message[1])
    );
  }

  if (message[0] === "/m" || message[0] === "/spawn") {
    let arg = message.slice(1).join(" ");
    let id = Number(arg);

    // If not a number, search by name
    if (isNaN(id) || arg === "") {
      let result = gameServer.database.getMonsterByName(arg);
      if (result === null) {
        return player.sendCancelMessage("Monster not found: " + arg);
      }
      id = result.id;
    }

    return gameServer.world.creatureHandler.spawnCreature(
      id,
      player.getPosition()
    );
  }

  if (message[0] === "/path") {
    let a = player.getPosition();
    let b = a.add(new Position(Number(message[1]), Number(message[2]), 0));
    let p = gameServer.world.findPath(player, a, b, 1);
    p.forEach(function (tile) {
      gameServer.world.sendMagicEffect(
        tile.getPosition(),
        CONST.EFFECT.MAGIC.TELEPORT
      );
    });
  }

  if (message[0] === "/addskill") {
    return this.handleCommandAddSkill(player, message[1], message[2]);
  }

  // Create item command: /i [item_id_or_name] [count]
  if (message[0] === "/i") {
    let itemArg = message[1];
    let count = 1;
    let itemId = null;

    // Check if first argument is a number (ID)
    if (!isNaN(Number(itemArg))) {
      itemId = Number(itemArg);
      count = Number(message[2]) || 1;
    } else {
      // Try to find by name - join remaining args (except last if it's a number for count)
      let nameArgs = message.slice(1);

      // Check if last arg is a number (count)
      let lastArg = nameArgs[nameArgs.length - 1];
      if (nameArgs.length > 1 && !isNaN(Number(lastArg))) {
        count = Number(lastArg);
        nameArgs = nameArgs.slice(0, -1);
      }

      let itemName = nameArgs.join(" ");
      itemId = gameServer.database.getItemIdByName(itemName);

      if (itemId === null) {
        return player.sendCancelMessage("Item '" + itemName + "' not found. Usage: /i [id_or_name] [count]");
      }
    }

    // Validate item ID
    if (isNaN(itemId) || itemId <= 0) {
      return player.sendCancelMessage("Invalid item. Usage: /i [item_id_or_name] [count]");
    }

    // Create the item
    let thing = gameServer.database.createThing(itemId);

    if (thing === null) {
      return player.sendCancelMessage("Item with ID " + itemId + " does not exist.");
    }

    // Set count for stackable items
    if (thing.isStackable() && count > 1) {
      thing.setCount(Math.min(count, 100)); // Max 100 for stackable items
    }

    // Add the item to the player's position
    gameServer.world.addTopThing(player.getPosition(), thing);

    // Send success message with item name if available
    let itemName = thing.getPrototype().properties?.name || itemId;
    return player.sendCancelMessage("Created " + itemName + (count > 1 ? " x" + count : ""));
  }

  if (message[0] === "/goto") {
    let name = message.slice(1).join(" ").toLowerCase();
    let result = this.findCreatureByName(name);

    if (result.target) {
      gameServer.world.creatureHandler.teleportCreature(player, result.target.getPosition());
      return player.sendCancelMessage("Teleported to " + result.targetName + ".");
    } else {
      return player.sendCancelMessage("Creature not found: " + name);
    }
  }

  if (message[0] === "/bring") {
    let name = message.slice(1).join(" ").toLowerCase();
    let result = this.findCreatureByName(name);

    if (result.target) {
      gameServer.world.creatureHandler.teleportCreature(result.target, player.getPosition());
      return player.sendCancelMessage("Brought " + result.targetName + " to you.");
    } else {
      return player.sendCancelMessage("Creature not found: " + name);
    }
  }

  // Spawn NPC command: /npc [npc_name]
  if (message[0] === "/npc") {
    let npcName = message.slice(1).join(" ").toLowerCase();

    if (!npcName) {
      return player.sendCancelMessage("Usage: /npc [npc_name]. Available: cipfried, aldee");
    }

    try {
      // Build path to NPC definition file using process.cwd()
      let npcFile = npcName + ".json";
      let npcPath = path.join(process.cwd(), "data", "740", "npcs", "definitions", npcFile);


      // Clear cache to allow reloading
      if (require.cache[npcPath]) {
        delete require.cache[npcPath];
      }

      let data = require(npcPath);

      // Create and spawn NPC at player position
      let npc = new NPC(data);
      gameServer.world.creatureHandler.addCreatureSpawn(npc, player.getPosition());

      return player.sendCancelMessage("Spawned NPC: " + data.creatureStatistics.name);
    } catch (error) {
      return player.sendCancelMessage("NPC error: " + error.message);
    }
  }

  // Learn all spells command: /learnall
  if (message[0] === "/learnall") {
    // Add all spell IDs (0-19) to player's spellbook
    for (let sid = 0; sid <= 19; sid++) {
      if (!player.spellbook.getAvailableSpells().has(sid)) {
        player.spellbook.addAvailableSpell(sid);
      }
    }
    return player.sendCancelMessage("You have learned all spells (0-19)!");
  }

  // Reset character command: /reset
  if (message[0] === "/reset") {
    // Reset to level 1 stats
    player.skills.experience = 0;
    player.skills.magic = 0;
    player.skills.fist = 10;
    player.skills.club = 10;
    player.skills.sword = 10;
    player.skills.axe = 10;
    player.skills.distance = 10;
    player.skills.shielding = 10;
    player.skills.fishing = 10;

    // Reset properties to level 1 values
    player.setProperty(CONST.PROPERTIES.HEALTH, 150);
    player.setProperty(CONST.PROPERTIES.MAX_HEALTH, 150);
    player.setProperty(CONST.PROPERTIES.MANA, 35);
    player.setProperty(CONST.PROPERTIES.MAX_MANA, 35);
    player.setProperty(CONST.PROPERTIES.CAPACITY, 400);

    // Also update properties object if it exists
    if (player.properties) {
      player.properties.health = 150;
      player.properties.maxHealth = 150;
      player.properties.mana = 35;
      player.properties.maxMana = 35;
      player.properties.capacity = 400;
    }

    return player.sendCancelMessage("Character reset to Level 1! Experience: 0, HP: 150, Mana: 35");
  }

  // Test magic effect command: /z [effect_id]
  if (message[0] === "/z") {
    let effectId = Number(message[1]);

    if (isNaN(effectId) || effectId < 0) {
      return player.sendCancelMessage("Usage: /z [effect_id] - Shows magic effect at your position.");
    }

    gameServer.world.sendMagicEffect(player.getPosition(), effectId);
    return player.sendCancelMessage("Effect " + effectId + " displayed.");
  }

  // Test distance/missile effect command: /x [shoot_type_id]
  if (message[0] === "/x") {
    let shootType = Number(message[1]);

    if (isNaN(shootType) || shootType < 0) {
      return player.sendCancelMessage("Usage: /x [shoot_type_id] - Shoots missile from you.");
    }

    // Get target position (3 tiles in front of player based on direction)
    let from = player.getPosition();
    let direction = player.getProperty(CONST.PROPERTIES.DIRECTION) || 2; // Default south
    let dx = 0, dy = 0;

    switch (direction) {
      case 0: dy = -3; break; // North
      case 1: dx = 3; break;  // East
      case 2: dy = 3; break;  // South
      case 3: dx = -3; break; // West
    }

    let to = from.add(new Position(dx, dy, 0));
    gameServer.world.sendDistanceEffect(from, to, shootType);
    return player.sendCancelMessage("Missile " + shootType + " fired.");
  }
};

module.exports = CommandHandler;
