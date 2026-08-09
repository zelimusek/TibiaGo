"use strict";

const fs = require("fs");
const path = require("path");
const { RadioStreamPacket } = requireModule("network/protocol");

const PARTY_FLOW_CONFIG = {
  floor: {
    from: { x: 32509, y: 32340, z: 7 },
    to: { x: 32521, y: 32352, z: 7 }
  },
  lobbyDurations: [
    { minimumOnline: 11, durationMs: 90000 },
    { minimumOnline: 7, durationMs: 75000 },
    { minimumOnline: 4, durationMs: 60000 },
    { minimumOnline: 2, durationMs: 45000 }
  ],
  entranceBonusMs: 30000,
  rouletteDurationMs: 10000,
  rouletteCelebrationMs: 8000,
  winnerCelebrationMs: 11200,
  choiceDurationMs: 30000,
  choiceResendMs: 1000,
  gatheringDurationMs: 10000,
  gatheringAllReadyMs: 3000,
  gatheringLastCallMs: 5000,
  waitingAnimationDurationMs: 2147483647,
  lowPopulationTimeoutMs: 60000,
  noWinnerDelayMs: 1500
};

const GAME_LABELS = {
  lava: "Floor Is Lava",
  "bomber-elimination": "Bomberman: Elimination",
  "bomber-mayhem": "Bomberman: Mayhem",
  chairs: "Laser Chairs"
};

const GAME_KEYS = Object.keys(GAME_LABELS);
const CHOICE_KEYS = new Set(GAME_KEYS.concat(["laser-roulette", "random-game"]));

const PartyGameFlow = function (creatureHandler, options) {
  options = options || {};
  this.__creatureHandler = creatureHandler;
  this.__state = null;
  this.__armed = true;
  this.__now = options.now || Date.now;
  this.__random = options.random || Math.random;
  this.__settingsPath = options.settingsPath === false
    ? null
    : (options.settingsPath || path.resolve(
      process.cwd(), "data", CONFIG.SERVER.CLIENT_VERSION.toString(), "party-game-flow.json"
    ));
  this.__settings = this.__loadSettings();
};

PartyGameFlow.prototype.getConfig = function () {
  return PARTY_FLOW_CONFIG;
};

PartyGameFlow.prototype.isActive = function () {
  return this.__state !== null;
};

PartyGameFlow.prototype.__loadSettings = function () {
  let settings = { enabled: true };
  if (this.__settingsPath === null || !fs.existsSync(this.__settingsPath)) return settings;

  try {
    let stored = JSON.parse(fs.readFileSync(this.__settingsPath, "utf8"));
    if (typeof stored.enabled === "boolean") settings.enabled = stored.enabled;
  } catch (error) {
    console.error("Could not load Laser Roulette settings:", error.message);
  }
  return settings;
};

PartyGameFlow.prototype.__saveSettings = function () {
  if (this.__settingsPath === null) return true;
  try {
    fs.writeFileSync(this.__settingsPath, JSON.stringify(this.__settings, null, 2) + "\n", "utf8");
    return true;
  } catch (error) {
    console.error("Could not save Laser Roulette settings:", error.message);
    return false;
  }
};

PartyGameFlow.prototype.isEnabled = function () {
  return this.__settings.enabled === true;
};

PartyGameFlow.prototype.getStatus = function () {
  let status = this.isEnabled() ? "enabled" : "disabled";
  let phase = this.__state ? " Current phase: " + this.__state.phase + "." : "";
  return "Laser Roulette mode is " + status + "." + phase;
};

PartyGameFlow.prototype.setEnabled = function (enabled) {
  enabled = enabled === true;
  this.__settings.enabled = enabled;

  if (enabled) {
    this.__armed = true;
    this.__sync();
  } else {
    if (this.__state) {
      this.stop("Laser Roulette mode has been disabled by a game master.");
    } else {
      this.__armed = false;
      this.__sync();
    }
  }

  if (!this.__saveSettings()) {
    return {
      ok: false,
      message: "Laser Roulette mode changed in memory, but could not be saved."
    };
  }
  return {
    ok: true,
    message: "Laser Roulette mode is now " + (enabled ? "enabled" : "disabled") + "."
  };
};

PartyGameFlow.prototype.__getPlayerId = function (player) {
  return player && typeof player.getId === "function" ? player.getId() : null;
};

PartyGameFlow.prototype.__getPlayerName = function (player) {
  return player && typeof player.getProperty === "function"
    ? player.getProperty(CONST.PROPERTIES.NAME)
    : (player ? player.name : null);
};

PartyGameFlow.prototype.__isOnFloor = function (position) {
  let floor = PARTY_FLOW_CONFIG.floor;
  return Boolean(position)
    && position.z === floor.from.z
    && position.x >= floor.from.x
    && position.x <= floor.to.x
    && position.y >= floor.from.y
    && position.y <= floor.to.y;
};

PartyGameFlow.prototype.__getFloorPlayers = function () {
  let players = [];
  this.__creatureHandler.getConnectedPlayers().forEach(function (player) {
    if (player && this.__isOnFloor(player.position)) players.push(player);
  }, this);
  return players.sort(function (left, right) {
    return left.getId() - right.getId();
  });
};

PartyGameFlow.prototype.__getRadioPlayers = function () {
  let players = [];
  this.__creatureHandler.getConnectedPlayers().forEach(function (player) {
    if (player && this.__creatureHandler.isInsidePartyRadioZone(player.position)) players.push(player);
  }, this);
  return players;
};

PartyGameFlow.prototype.__getPlayerById = function (id) {
  let match = null;
  this.__creatureHandler.getConnectedPlayers().forEach(function (player) {
    if (this.__getPlayerId(player) === id) match = player;
  }, this);
  return match;
};

PartyGameFlow.prototype.__durationForOnline = function (online) {
  online = Math.max(0, Number(online) || 0);
  let match = PARTY_FLOW_CONFIG.lobbyDurations.find(function (entry) {
    return online >= entry.minimumOnline;
  });
  return match ? match.durationMs : PARTY_FLOW_CONFIG.lobbyDurations.at(-1).durationMs;
};

PartyGameFlow.prototype.__sync = function () {
  if (typeof this.__creatureHandler.__resyncRadioAmbience === "function") {
    this.__creatureHandler.__resyncRadioAmbience();
  }
};

PartyGameFlow.prototype.__broadcast = function (message) {
  this.__creatureHandler.getConnectedPlayers().forEach(function (player) {
    if (this.__creatureHandler.isInsidePartyRadioZone(player.position)) {
      player.sendCancelMessage(message);
    }
  }, this);
};

PartyGameFlow.prototype.__announce = function (message) {
  if (typeof this.__creatureHandler.announceNpcYell === "function") {
    this.__creatureHandler.announceNpcYell("DJ Thomas", message);
  }
};

PartyGameFlow.prototype.__sendChoicePacket = function (player, payload) {
  if (!player || typeof player.write !== "function") return;
  player.write(new RadioStreamPacket(
    true,
    "party-choice:" + encodeURIComponent(JSON.stringify(payload)),
    0
  ));
};

PartyGameFlow.prototype.__closeChoice = function (player) {
  this.__sendChoicePacket(player, { action: "close" });
};

PartyGameFlow.prototype.__shuffle = function (values) {
  let shuffled = values.slice();
  for (let index = shuffled.length - 1; index > 0; index--) {
    let other = Math.floor(this.__random() * (index + 1));
    let temporary = shuffled[index];
    shuffled[index] = shuffled[other];
    shuffled[other] = temporary;
  }
  return shuffled;
};

PartyGameFlow.prototype.__hasRunningGame = function () {
  return Boolean(
    (this.__creatureHandler.floorLava && this.__creatureHandler.floorLava.isRunning())
    || (this.__creatureHandler.bomberman && this.__creatureHandler.bomberman.isRunning())
    || (this.__creatureHandler.laserChairs && this.__creatureHandler.laserChairs.isRunning())
  );
};

PartyGameFlow.prototype.__isSelectedGameRunning = function () {
  if (!this.__state || this.__state.phase !== "game") return false;
  if (this.__state.game === "lava") return this.__creatureHandler.floorLava.isRunning();
  if (this.__state.game === "chairs") return this.__creatureHandler.laserChairs.isRunning();
  return this.__creatureHandler.bomberman.isRunning();
};

PartyGameFlow.prototype.__startLobby = function (now) {
  let online = this.__creatureHandler.getConnectedPlayers().size;
  let durationMs = this.__durationForOnline(online);
  let radioPlayers = this.__getRadioPlayers();
  this.__state = {
    phase: "lobby",
    startedAt: now,
    endsAt: now + durationMs,
    maximumDurationMs: durationMs,
    peakOnline: online,
    radioPlayerIds: new Set(radioPlayers.map(this.__getPlayerId.bind(this))),
    bonusPlayerIds: new Set(),
    lastBonus: null,
    waitingAnnounced: false,
    lowPopulationSince: null,
    previousGame: null
  };
  this.__armed = false;
  this.__broadcast("Laser Roulette starts soon! Gather on the dance floor.");
  this.__sync();
};

PartyGameFlow.prototype.__updateLobbyEntrants = function (now) {
  let radioPlayers = this.__getRadioPlayers();
  let currentIds = new Set(radioPlayers.map(this.__getPlayerId.bind(this)));
  let online = this.__creatureHandler.getConnectedPlayers().size;
  this.__state.peakOnline = Math.max(this.__state.peakOnline, online);
  let maximumDurationMs = this.__durationForOnline(this.__state.peakOnline);
  this.__state.maximumDurationMs = maximumDurationMs;

  radioPlayers.forEach(function (player) {
    let id = this.__getPlayerId(player);
    if (this.__state.radioPlayerIds.has(id) || this.__state.bonusPlayerIds.has(id)) return;
    this.__state.bonusPlayerIds.add(id);
    let oldEndsAt = this.__state.endsAt;
    let maximumEndsAt = this.__state.startedAt + maximumDurationMs;
    this.__state.endsAt = Math.min(
      maximumEndsAt,
      this.__state.endsAt + PARTY_FLOW_CONFIG.entranceBonusMs
    );
    let addedMs = Math.max(0, this.__state.endsAt - oldEndsAt);
    if (addedMs <= 0) return;
    this.__state.lastBonus = {
      playerId: id,
      playerName: this.__getPlayerName(player),
      position: { x: player.position.x, y: player.position.y, z: player.position.z },
      addedSeconds: Math.round(addedMs / 1000),
      startedAt: now
    };
    this.__sync();
  }, this);

  this.__state.radioPlayerIds = currentIds;
};

PartyGameFlow.prototype.__startRoulette = function (reason) {
  let candidates = this.__shuffle(this.__getFloorPlayers());
  if (candidates.length < 2) {
    this.__state.phase = "waiting-roulette";
    this.__state.waitingReason = reason || "roulette";
    this.__state.lowPopulationSince = this.__state.lowPopulationSince || this.__now();
    this.__broadcast("Laser Roulette is waiting for at least two players on the dance floor.");
    this.__sync();
    return false;
  }

  let winner = candidates[Math.floor(this.__random() * candidates.length)];
  let now = this.__now();
  this.__state.phase = "roulette";
  this.__state.startedAt = now;
  this.__state.endsAt = now + PARTY_FLOW_CONFIG.rouletteDurationMs;
  this.__state.candidates = candidates.map(function (player) {
    return {
      targetId: this.__getPlayerId(player),
      targetName: this.__getPlayerName(player),
      target: player
    };
  }, this);
  this.__state.winnerId = this.__getPlayerId(winner);
  this.__state.lowPopulationSince = null;
  this.__broadcast("Laser Roulette is choosing the next party leader!");
  this.__sync();
  return true;
};

PartyGameFlow.prototype.__prepareChooser = function (player, source) {
  if (!player) return this.__startGathering("laser-roulette");
  let now = this.__now();
  this.__state.phase = "choice-pending";
  this.__state.chooserId = this.__getPlayerId(player);
  this.__state.chooserName = this.__getPlayerName(player);
  this.__state.choiceSource = source;
  this.__state.opensAt = now + (
    source === "roulette"
      ? PARTY_FLOW_CONFIG.rouletteCelebrationMs
      : PARTY_FLOW_CONFIG.winnerCelebrationMs
  );
  this.__state.lowPopulationSince = null;
  this.__sync();
};

PartyGameFlow.prototype.__openChoice = function () {
  let chooser = this.__getPlayerById(this.__state.chooserId);
  if (!chooser || !this.__creatureHandler.isInsidePartyRadioZone(chooser.position)) {
    return this.__startGathering("laser-roulette");
  }
  let now = this.__now();
  this.__state.phase = "choice";
  this.__state.choiceEndsAt = now + PARTY_FLOW_CONFIG.choiceDurationMs;
  this.__state.lastChoicePacketAt = 0;
  this.__resendChoice(chooser, now);
  this.__broadcast("%s is choosing the next challenge...".format(this.__state.chooserName));
};

PartyGameFlow.prototype.__resendChoice = function (chooser, now) {

  /*
   * Function PartyGameFlow.__resendChoice
   * Re-sends the protected chooser modal until the server receives a choice.
   * This makes the one-shot UI recover after a teleport, reconnect or a
   * temporarily busy browser frame without extending the choice deadline.
   */

  if (!chooser || !this.__state || this.__state.phase !== "choice") {
    return false;
  }

  now = Number.isFinite(now) ? now : this.__now();
  let remainingMs = Math.max(1000, this.__state.choiceEndsAt - now);
  this.__sendChoicePacket(chooser, {
    action: "open",
    chooserName: this.__state.chooserName,
    durationMs: remainingMs
  });
  this.__state.lastChoicePacketAt = now;
  return true;
};

PartyGameFlow.prototype.__chooseRandomGame = function () {
  let available = GAME_KEYS.filter(function (key) {
    return key !== this.__state.previousGame;
  }, this);
  if (available.length === 0) available = GAME_KEYS.slice();
  return available[Math.floor(this.__random() * available.length)];
};

PartyGameFlow.prototype.__startGathering = function (choice) {
  let randomChoice = choice === "random-game";
  let selectedGame = randomChoice ? this.__chooseRandomGame() : choice;
  let now = this.__now();
  let expectedPlayerIds = new Set(this.__getRadioPlayers().map(this.__getPlayerId.bind(this)));
  let label = selectedGame === "laser-roulette"
    ? "Laser Roulette"
    : GAME_LABELS[selectedGame];

  this.__state.phase = "gathering";
  this.__state.selectedGame = selectedGame;
  this.__state.randomChoice = randomChoice;
  this.__state.gatheringStage = "initial";
  this.__state.gatheringStartedAt = now;
  this.__state.countdownStartedAt = now;
  this.__state.endsAt = now + PARTY_FLOW_CONFIG.gatheringDurationMs;
  this.__state.expectedPlayerIds = expectedPlayerIds;
  this.__state.lowPopulationSince = null;
  this.__broadcast(label + " is next! Everyone, return to the dance floor!");
  this.__sync();
  return true;
};

PartyGameFlow.prototype.__startGatheringSelection = function () {
  if (this.__state.selectedGame === "laser-roulette") {
    return this.__startRoulette("gathering");
  }
  return this.__startGame(this.__state.selectedGame, this.__state.randomChoice);
};

PartyGameFlow.prototype.__getGatheringReadiness = function (floorPlayers) {
  let floorIds = new Set(floorPlayers.map(this.__getPlayerId.bind(this)));
  let expectedIds = this.__state.expectedPlayerIds || new Set();
  let expectedReady = 0;
  expectedIds.forEach(function (id) {
    if (floorIds.has(id)) expectedReady++;
  });
  return {
    readyCount: floorPlayers.length,
    expectedCount: Math.max(expectedIds.size, floorPlayers.length),
    allExpectedReady: floorPlayers.length >= 2
      && expectedIds.size > 0
      && expectedReady === expectedIds.size
  };
};

PartyGameFlow.prototype.__tickGathering = function (now, floorPlayers) {
  let readiness = this.__getGatheringReadiness(floorPlayers);
  let stage = this.__state.gatheringStage;

  if (stage === "initial" && readiness.allExpectedReady) {
    this.__state.gatheringStage = "all-ready";
    this.__state.countdownStartedAt = now;
    this.__state.endsAt = Math.min(
      this.__state.endsAt,
      now + PARTY_FLOW_CONFIG.gatheringAllReadyMs
    );
    this.__broadcast("Everyone is ready! The next challenge starts in 3 seconds!");
    this.__sync();
    stage = "all-ready";
  }

  if (stage === "waiting" && floorPlayers.length >= 2) {
    this.__state.gatheringStage = "last-call";
    this.__state.countdownStartedAt = now;
    this.__state.endsAt = now + PARTY_FLOW_CONFIG.gatheringLastCallMs;
    this.__broadcast("Last call! The next challenge starts in 5 seconds!");
    this.__sync();
    return;
  }

  if (stage === "waiting" || now < this.__state.endsAt) return;
  if (floorPlayers.length >= 2) return this.__startGatheringSelection();

  this.__state.gatheringStage = "waiting";
  this.__state.countdownStartedAt = now;
  this.__state.endsAt = null;
  this.__broadcast("The next challenge is waiting for at least two players on the dance floor.");
  this.__sync();
};

PartyGameFlow.prototype.__startGame = function (key, randomChoice) {
  let result;
  if (key === "lava") result = this.__creatureHandler.floorLava.start();
  else if (key === "chairs") result = this.__creatureHandler.laserChairs.start();
  else result = this.__creatureHandler.bomberman.start(key === "bomber-elimination" ? "elimination" : "mayhem");

  if (!result || result.ok !== true) {
    let chooser = this.__getPlayerById(this.__state.chooserId);
    if (chooser) chooser.sendCancelMessage(result && result.message ? result.message : "That game could not be started.");
    let startAttempts = (this.__state.startAttempts || 0) + 1;
    if (startAttempts >= 3) {
      this.__broadcast("That challenge could not be prepared. Laser Roulette will choose again!");
      return this.__startGathering("laser-roulette");
    }
    this.__state.phase = "waiting-game";
    this.__state.selectedGame = key;
    this.__state.randomChoice = randomChoice === true;
    this.__state.startAttempts = startAttempts;
    this.__state.nextStartAttemptAt = this.__now() + 2000;
    this.__state.lowPopulationSince = this.__state.lowPopulationSince || this.__now();
    this.__sync();
    return false;
  }

  this.__state.phase = "game";
  this.__state.game = key;
  this.__state.previousGame = key;
  this.__state.gameStartedAt = this.__now();
  this.__state.finishedDetectedAt = null;
  this.__state.lowPopulationSince = null;
  let message = randomChoice
    ? "Random Game chooses %s!".format(GAME_LABELS[key])
    : "%s chose %s!".format(this.__state.chooserName, GAME_LABELS[key]);
  this.__announce(message);
  this.__broadcast(message);
  this.__sync();
  return true;
};

PartyGameFlow.prototype.__queueChoice = function (choice) {
  let chooser = this.__getPlayerById(this.__state.chooserId);
  this.__closeChoice(chooser);
  return this.__startGathering(choice);
};

PartyGameFlow.prototype.handleChoice = function (player, choice) {
  choice = String(choice || "").trim().toLowerCase();
  if (!this.isEnabled()) {
    player.sendCancelMessage("Laser Roulette mode is disabled.");
    return false;
  }
  if (!this.__state || this.__state.phase !== "choice") {
    player.sendCancelMessage("There is no active party choice.");
    return false;
  }
  if (this.__getPlayerId(player) !== this.__state.chooserId) {
    player.sendCancelMessage("Only the selected party leader may choose the next challenge.");
    return false;
  }
  if (!CHOICE_KEYS.has(choice)) {
    player.sendCancelMessage("That party challenge is not available.");
    return false;
  }
  return this.__queueChoice(choice);
};

PartyGameFlow.prototype.handleGameWinner = function (winner, game) {
  if (!this.isEnabled()) return false;
  if (!winner) return false;
  if (!this.__state) {
    this.__state = { previousGame: game || null, lowPopulationSince: null };
    this.__armed = false;
  } else if (game) {
    this.__state.previousGame = game;
  }
  this.__prepareChooser(winner, "winner");
  return true;
};

PartyGameFlow.prototype.handleGameStarted = function (game) {
  if (!this.isEnabled()) return false;
  if (!GAME_KEYS.includes(game)) return false;
  if (!this.__state) {
    this.__state = { previousGame: game, lowPopulationSince: null };
    this.__armed = false;
  }
  this.__state.phase = "game";
  this.__state.game = game;
  this.__state.previousGame = game;
  this.__state.gameStartedAt = this.__now();
  this.__state.finishedDetectedAt = null;
  return true;
};

PartyGameFlow.prototype.stop = function (message) {
  if (!this.__state) return false;
  let chooser = this.__state.chooserId ? this.__getPlayerById(this.__state.chooserId) : null;
  this.__closeChoice(chooser);
  this.__state = null;
  this.__armed = false;
  if (message) this.__broadcast(message);
  this.__sync();
  return true;
};

PartyGameFlow.prototype.handleDestination = function (player, position) {
  if (!this.__state || this.__state.phase !== "roulette") return null;
  let participant = this.__state.candidates.some(function (candidate) {
    return candidate.targetId === this.__getPlayerId(player);
  }, this);
  let destinationOnFloor = this.__isOnFloor(position);
  if (participant && !destinationOnFloor) {
    player.sendCancelMessage("Wait for Laser Roulette to finish.");
    return { position: null };
  }
  if (!participant && destinationOnFloor) {
    player.sendCancelMessage("Laser Roulette is already spinning.");
    return { position: null };
  }
  return null;
};

PartyGameFlow.prototype.getPayload = function () {
  if (!this.__state || !["lobby", "roulette", "gathering"].includes(this.__state.phase)) return null;
  let now = this.__now();
  let gatheringWaiting = this.__state.phase === "gathering"
    && this.__state.gatheringStage === "waiting";
  let countdownStartedAt = this.__state.phase === "gathering"
    ? this.__state.countdownStartedAt
    : this.__state.startedAt;
  let animationStartedAt = this.__state.phase === "gathering"
    ? this.__state.gatheringStartedAt
    : this.__state.startedAt;
  let payload = {
    phase: this.__state.phase,
    elapsedMs: gatheringWaiting ? 0 : Math.max(0, now - countdownStartedAt),
    animationElapsedMs: Math.max(0, now - animationStartedAt),
    durationMs: gatheringWaiting
      ? PARTY_FLOW_CONFIG.waitingAnimationDurationMs
      : Math.max(1, this.__state.endsAt - countdownStartedAt),
    floor: PARTY_FLOW_CONFIG.floor
  };
  if (this.__state.phase === "lobby") {
    payload.maximumDurationMs = this.__state.maximumDurationMs;
    payload.waitingForPlayers = now >= this.__state.endsAt && this.__getFloorPlayers().length < 2;
    if (this.__state.lastBonus && now - this.__state.lastBonus.startedAt < 2400) {
      payload.lastBonus = {
        playerId: this.__state.lastBonus.playerId,
        playerName: this.__state.lastBonus.playerName,
        position: this.__state.lastBonus.position,
        addedSeconds: this.__state.lastBonus.addedSeconds,
        elapsedMs: now - this.__state.lastBonus.startedAt
      };
    }
  } else if (this.__state.phase === "gathering") {
    let readiness = this.__getGatheringReadiness(this.__getFloorPlayers());
    payload.waitingForPlayers = gatheringWaiting;
    payload.gatheringStage = this.__state.gatheringStage;
    payload.gameLabel = this.__state.selectedGame === "laser-roulette"
      ? "LASER ROULETTE"
      : String(GAME_LABELS[this.__state.selectedGame] || "NEXT CHALLENGE").toUpperCase();
    payload.readyCount = readiness.readyCount;
    payload.expectedCount = readiness.expectedCount;
  } else {
    payload.winnerId = this.__state.winnerId;
    payload.candidates = this.__state.candidates.map(function (candidate) {
      let target = candidate.target;
      return {
        targetId: candidate.targetId,
        targetName: candidate.targetName,
        targetPosition: target && target.position
          ? { x: target.position.x, y: target.position.y, z: target.position.z }
          : null
      };
    }).filter(function (candidate) { return candidate.targetPosition !== null; });
  }
  return payload;
};

PartyGameFlow.prototype.__updateLowPopulation = function (now, floorCount) {
  if (!this.__state) return false;
  if (floorCount >= 2) {
    this.__state.lowPopulationSince = null;
    return false;
  }
  if (this.__state.lowPopulationSince === null) this.__state.lowPopulationSince = now;
  if (now - this.__state.lowPopulationSince < PARTY_FLOW_CONFIG.lowPopulationTimeoutMs) return false;
  this.stop("The party game chain ended because too few players returned to the dance floor.");
  return true;
};

PartyGameFlow.prototype.tick = function () {
  if (!this.isEnabled()) return;
  let now = this.__now();
  let floorPlayers = this.__getFloorPlayers();

  if (!this.__state) {
    if (floorPlayers.length === 0) this.__armed = true;
    if (this.__armed && floorPlayers.length >= 2 && !this.__hasRunningGame()) this.__startLobby(now);
    return;
  }

  if (this.__state.phase === "gathering") {
    this.__tickGathering(now, floorPlayers);
    return;
  }

  if (this.__updateLowPopulation(now, floorPlayers.length)) return;

  if (this.__state.phase === "lobby") {
    this.__updateLobbyEntrants(now);
    if (now >= this.__state.endsAt && floorPlayers.length >= 2) {
      this.__startRoulette("lobby");
    } else if (now >= this.__state.endsAt && !this.__state.waitingAnnounced) {
      this.__state.waitingAnnounced = true;
      this.__broadcast("Laser Roulette is waiting for at least two players on the dance floor.");
      this.__sync();
    }
    return;
  }

  if (this.__state.phase === "waiting-roulette") {
    if (floorPlayers.length >= 2) this.__startRoulette(this.__state.waitingReason);
    return;
  }

  if (this.__state.phase === "roulette" && now >= this.__state.endsAt) {
    let winner = this.__getPlayerById(this.__state.winnerId);
    if (!winner || !this.__isOnFloor(winner.position)) return this.__startRoulette("winner-left");
    if (typeof this.__creatureHandler.focusSpotlightsOnPlayer === "function") {
      this.__creatureHandler.focusSpotlightsOnPlayer(winner, {
        durationMs: PARTY_FLOW_CONFIG.rouletteCelebrationMs,
        flashing: true,
        includeLasers: true,
        source: "laser-roulette-winner"
      });
    }
    this.__announce("Laser Roulette has chosen %s! You decide the next challenge!".format(this.__getPlayerName(winner)));
    this.__prepareChooser(winner, "roulette");
    return;
  }

  if (this.__state.phase === "choice-pending" && now >= this.__state.opensAt) {
    this.__openChoice();
    return;
  }

  if (this.__state.phase === "choice") {
    let chooser = this.__getPlayerById(this.__state.chooserId);
    if (!chooser || !this.__creatureHandler.isInsidePartyRadioZone(chooser.position) || now >= this.__state.choiceEndsAt) {
      this.__closeChoice(chooser);
      this.__startGathering("laser-roulette");
      return;
    }

    if (now - (this.__state.lastChoicePacketAt || 0) >= PARTY_FLOW_CONFIG.choiceResendMs) {
      this.__resendChoice(chooser, now);
    }
    return;
  }

  if (this.__state.phase === "waiting-game") {
    if (floorPlayers.length >= 2 && now >= (this.__state.nextStartAttemptAt || 0)) {
      this.__startGame(this.__state.selectedGame, this.__state.randomChoice);
    }
    return;
  }

  if (this.__state.phase === "game") {
    if (this.__isSelectedGameRunning()) {
      this.__state.finishedDetectedAt = null;
      return;
    }
    if (this.__state.finishedDetectedAt === null) this.__state.finishedDetectedAt = now;
    if (now - this.__state.finishedDetectedAt >= PARTY_FLOW_CONFIG.noWinnerDelayMs) {
      this.__broadcast("Nobody won that round. Laser Roulette will choose the next party leader!");
      this.__startGathering("laser-roulette");
    }
  }
};

module.exports = PartyGameFlow;
