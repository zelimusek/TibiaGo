"use strict";

const { PartyAchievementPacket, CreatureTitlePacket } = requireModule("network/protocol");
const Position = requireModule("utils/position");

const DANCE_FLOOR = {
  from: { x: 32509, y: 32340, z: 7 },
  to: { x: 32521, y: 32352, z: 7 }
};

const CLUB_RANKS = [
  { title: "Newcomer", seconds: 0, rarity: "common" },
  { title: "Party Guest", seconds: 1800, rarity: "common" },
  { title: "Clubber", seconds: 7200, rarity: "rare" },
  { title: "Dancefloor Regular", seconds: 18000, rarity: "rare" },
  { title: "Groove Seeker", seconds: 43200, rarity: "epic" },
  { title: "Nightlife Enthusiast", seconds: 90000, rarity: "epic" },
  { title: "Party Veteran", seconds: 180000, rarity: "legendary" },
  { title: "Disco Legend", seconds: 360000, rarity: "legendary" }
];
const CLUB_AFK_LIMIT_MS = 2 * 60 * 60 * 1000;
const PUBLIC_PARTY_TIME_MIN_SECONDS = 30 * 60;
const ACHIEVEMENT_RULESET_VERSION = 2;

const COUNTER_LABELS = {
  lavaWins: "Floor Is Lava wins",
  bomberEliminationWins: "Elimination wins",
  bomberMayhemWins: "Mayhem wins",
  laserChairsWins: "Laser Chairs wins"
};

const RARITY_COLORS = {
  common: "#ffffff",
  rare: "#56a8ff",
  epic: "#c36bff",
  legendary: "#ffd34d"
};

const WORLD_CONFETTI_EFFECTS = [
  CONST.EFFECT.MAGIC.SOUND_RED,
  CONST.EFFECT.MAGIC.SOUND_YELLOW,
  CONST.EFFECT.MAGIC.SOUND_GREEN,
  CONST.EFFECT.MAGIC.SOUND_PURPLE,
  CONST.EFFECT.MAGIC.SOUND_BLUE,
  CONST.EFFECT.MAGIC.SOUND_WHITE
];

const WORLD_CONFETTI_WAVES = [
  [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]],
  [[-1, -1], [1, -1], [-1, 1], [1, 1], [-2, 0], [2, 0]],
  [[0, -2], [0, 2], [-2, -1], [2, -1], [-2, 1], [2, 1]]
];

const PartyAchievementSystem = function (creatureHandler) {
  this.__creatureHandler = creatureHandler;
  this.__definitions = requireData("achievements.json");
  this.__byId = new Map();
  this.__byTitle = new Map();
  this.__lastTickAt = Date.now();

  this.__definitions.forEach(function (definition) {
    this.__byId.set(definition.id, definition);
    this.__byTitle.set(definition.title.toLowerCase(), definition);
  }, this);
};

PartyAchievementSystem.prototype.__createState = function () {
  return {
    counters: {},
    unlocked: {},
    activeTitle: null,
    visitDates: [],
    rulesetVersion: ACHIEVEMENT_RULESET_VERSION
  };
};

PartyAchievementSystem.prototype.getState = function (player) {
  if (!player.storage || typeof player.storage !== "object") player.storage = {};
  let state = player.storage.partyAchievements;
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    state = this.__createState();
    player.storage.partyAchievements = state;
  }
  state.counters = state.counters && typeof state.counters === "object" ? state.counters : {};
  state.unlocked = state.unlocked && typeof state.unlocked === "object" ? state.unlocked : {};
  state.visitDates = Array.isArray(state.visitDates) ? state.visitDates : [];
  state.activeTitle = typeof state.activeTitle === "string" ? state.activeTitle : null;
  state.rulesetVersion = Math.max(0, Number(state.rulesetVersion) || 0);
  state.clubTimeSeconds = Math.max(0, Number(state.clubTimeSeconds) || 0);
  state.clubRank = Math.max(0, Math.min(CLUB_RANKS.length - 1, Number(state.clubRank) || 0));
  return state;
};

PartyAchievementSystem.prototype.initializePlayer = function (player) {
  this.preparePlayer(player);
  player.__lastPartyActivityAt = Date.now();
  this.__recordPartyVisit(player);
  this.__evaluate(player);
};

PartyAchievementSystem.prototype.preparePlayer = function (player) {
  this.__migrateRuleset(player);
  let state = this.getState(player);
  if (state.activeTitle && !state.unlocked[state.activeTitle]) state.activeTitle = null;
};

PartyAchievementSystem.prototype.__getEligibleAchievementIds = function (state) {
  let evaluation = {
    counters: state.counters && typeof state.counters === "object" ? state.counters : {},
    unlocked: {}
  };
  for (let pass = 0; pass < 2; pass++) {
    this.__definitions.forEach(function (definition) {
      if (!evaluation.unlocked[definition.id] && this.__meetsDefinition(evaluation, definition)) {
        evaluation.unlocked[definition.id] = true;
      }
    }, this);
  }
  return new Set(Object.keys(evaluation.unlocked));
};

PartyAchievementSystem.prototype.__migrateRuleset = function (player) {
  let state = this.getState(player);
  if (state.rulesetVersion >= ACHIEVEMENT_RULESET_VERSION) return false;
  let previousUnlocked = state.unlocked;
  let previousActiveTitle = state.activeTitle;
  let eligible = this.__getEligibleAchievementIds(state);
  let migratedAt = new Date().toISOString();
  state.unlocked = {};
  eligible.forEach(function (id) {
    state.unlocked[id] = previousUnlocked[id] || migratedAt;
  });
  state.activeTitle = previousActiveTitle && eligible.has(previousActiveTitle)
    ? previousActiveTitle
    : null;
  state.rulesetVersion = ACHIEVEMENT_RULESET_VERSION;
  return true;
};

PartyAchievementSystem.prototype.__isInside = function (position, area) {
  return position && position.z === area.from.z
    && position.x >= Math.min(area.from.x, area.to.x)
    && position.x <= Math.max(area.from.x, area.to.x)
    && position.y >= Math.min(area.from.y, area.to.y)
    && position.y <= Math.max(area.from.y, area.to.y);
};

PartyAchievementSystem.prototype.__recordPartyVisit = function (player) {
  if (!player.position || !this.__creatureHandler.isInsidePartyRadioZone(player.position)) return;
  let state = this.getState(player);
  let date = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Warsaw" });
  if (state.visitDates.indexOf(date) !== -1) return;
  state.visitDates.push(date);
  state.visitDates = state.visitDates.slice(-366);
  state.counters.partyVisitDays = state.visitDates.length;
  this.__evaluate(player);
};

PartyAchievementSystem.prototype.tick = function () {
  let now = Date.now();
  if (now - this.__lastTickAt < 1000) return;
  let seconds = Math.max(1, Math.min(5, Math.floor((now - this.__lastTickAt) / 1000)));
  this.__lastTickAt = now;
  this.__creatureHandler.getConnectedPlayers().forEach(function (player) {
    this.__recordPartyVisit(player);
    this.__tickClubRank(player, seconds, now);
    if (this.__isInside(player.position, DANCE_FLOOR)) {
      this.increment(player, "danceFloorSeconds", seconds);
    }
  }, this);
};

PartyAchievementSystem.prototype.__tickClubRank = function (player, seconds, now) {
  if (!this.__creatureHandler.isInsidePartyRadioZone(player.position)) return;
  let lastActivity = Number(player.__lastPartyActivityAt) || now;
  if (now - lastActivity > CLUB_AFK_LIMIT_MS) return;
  let state = this.getState(player);
  let previousRank = state.clubRank;
  state.clubTimeSeconds += seconds;
  while (previousRank + 1 < CLUB_RANKS.length
      && state.clubTimeSeconds >= CLUB_RANKS[previousRank + 1].seconds) {
    previousRank++;
  }
  if (previousRank === state.clubRank) return;
  state.clubRank = previousRank;
  let rank = CLUB_RANKS[previousRank];
  let next = CLUB_RANKS[previousRank + 1] || null;
  player.write(new PartyAchievementPacket("rank", {
    title: rank.title,
    seconds: state.clubTimeSeconds,
    nextRankSeconds: next ? Math.max(0, next.seconds - state.clubTimeSeconds) : 0
  }));
  player.sendCancelMessage("Club rank reached: %s!".format(rank.title));
  this.__showWorldConfetti(player);
};

PartyAchievementSystem.prototype.increment = function (player, counter, amount) {
  if (!player) return 0;
  let state = this.getState(player);
  state.counters[counter] = Math.max(0, Number(state.counters[counter]) || 0) + (Number(amount) || 1);
  this.__evaluate(player);
  return state.counters[counter];
};

PartyAchievementSystem.prototype.setMaximum = function (player, counter, value) {
  if (!player) return 0;
  let state = this.getState(player);
  state.counters[counter] = Math.max(Number(state.counters[counter]) || 0, Number(value) || 0);
  this.__evaluate(player);
  return state.counters[counter];
};

PartyAchievementSystem.prototype.__meetsDefinition = function (state, definition) {
  if (definition.requiresAllOther) {
    return this.__definitions.every(function (candidate) {
      return candidate.id === definition.id || Boolean(state.unlocked[candidate.id]);
    });
  }
  if (definition.requirements) {
    return Object.keys(definition.requirements).every(function (counter) {
      return (Number(state.counters[counter]) || 0) >= definition.requirements[counter];
    });
  }
  return (Number(state.counters[definition.counter]) || 0) >= definition.target;
};

PartyAchievementSystem.prototype.__evaluate = function (player) {
  let state = this.getState(player);
  let newlyUnlocked = [];
  for (let pass = 0; pass < 2; pass++) {
    this.__definitions.forEach(function (definition) {
      if (!state.unlocked[definition.id] && this.__meetsDefinition(state, definition)) {
        state.unlocked[definition.id] = new Date().toISOString();
        newlyUnlocked.push(definition);
      }
    }, this);
  }
  newlyUnlocked.forEach(function (definition) { this.__notifyUnlock(player, definition); }, this);
};

PartyAchievementSystem.prototype.__showWorldConfetti = function (player) {
  WORLD_CONFETTI_WAVES.forEach(function (offsets, waveIndex) {
    setTimeout(function () {
      if (!player.position || !this.__creatureHandler.isPlayerOnline(player)) return;
      let center = player.position;
      offsets.forEach(function (offset, effectIndex) {
        let position = new Position(center.x + offset[0], center.y + offset[1], center.z);
        let effect = WORLD_CONFETTI_EFFECTS[(effectIndex + waveIndex * 2) % WORLD_CONFETTI_EFFECTS.length];
        gameServer.world.sendMagicEffect(position, effect);
      });
    }.bind(this), waveIndex * 220);
  }, this);
};

PartyAchievementSystem.prototype.__notifyUnlock = function (player, definition) {
  player.write(new PartyAchievementPacket("unlock", { achievement: this.__toClientEntry(player, definition) }));
  player.sendCancelMessage("Achievement unlocked: %s!".format(definition.title));
  if (
    this.__creatureHandler.isInsidePartyRadioZone(player.position)
    && typeof this.__creatureHandler.announceNpcYell === "function"
  ) {
    this.__creatureHandler.announceNpcYell(
      "DJ Thomas",
      "%s unlocked %s!".format(player.getProperty(CONST.PROPERTIES.NAME), definition.title)
    );
  }
  if (!player.position) return;
  this.__showWorldConfetti(player);
};

PartyAchievementSystem.prototype.__toClientEntry = function (player, definition) {
  let state = this.getState(player);
  let progress;
  let target;
  if (definition.requirements) {
    let keys = Object.keys(definition.requirements);
    progress = keys.filter(function (counter) {
      return (Number(state.counters[counter]) || 0) >= definition.requirements[counter];
    }).length;
    target = keys.length;
  } else if (definition.requiresAllOther) {
    target = this.__definitions.length - 1;
    progress = this.__definitions.filter(function (candidate) {
      return candidate.id !== definition.id && state.unlocked[candidate.id];
    }).length;
  } else {
    progress = Math.max(0, Number(state.counters[definition.counter]) || 0);
    target = definition.target;
  }
  let progressDetails = definition.requirements
    ? Object.keys(definition.requirements).map(function (counter) {
      return {
        counter: counter,
        label: COUNTER_LABELS[counter] || counter,
        progress: Math.max(0, Number(state.counters[counter]) || 0),
        target: definition.requirements[counter]
      };
    })
    : [];
  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    rarity: definition.rarity || "common",
    color: RARITY_COLORS[definition.rarity] || RARITY_COLORS.common,
    progress: progress,
    target: target,
    progressDetails: progressDetails,
    unlocked: Boolean(state.unlocked[definition.id]),
    unlockedAt: state.unlocked[definition.id] || null,
    active: state.activeTitle === definition.id
  };
};

PartyAchievementSystem.prototype.getOverview = function (player) {
  let state = this.getState(player);
  let achievements = this.__definitions.map(function (definition) {
    return this.__toClientEntry(player, definition);
  }, this);
  return {
    achievements: achievements,
    unlockedCount: achievements.filter(function (entry) { return entry.unlocked; }).length,
    totalCount: achievements.length,
    activeTitle: state.activeTitle
  };
};

PartyAchievementSystem.prototype.open = function (player) {
  player.write(new PartyAchievementPacket("overview", this.getOverview(player)));
  return true;
};

PartyAchievementSystem.prototype.getActiveTitle = function (player) {
  if (!player || !player.isPlayer || !player.isPlayer()) return { title: "", rarity: "common" };
  let state = this.getState(player);
  let definition = state.activeTitle ? this.__byId.get(state.activeTitle) : null;
  if (definition) return { title: definition.title, rarity: definition.rarity || "common" };
  return { title: "", rarity: "common" };
};

PartyAchievementSystem.prototype.getClubRankInfo = function (player) {
  if (!player || !player.isPlayer || !player.isPlayer()) {
    return { title: "", seconds: 0, nextRankSeconds: 0 };
  }
  let state = this.getState(player);
  let rank = CLUB_RANKS[state.clubRank] || CLUB_RANKS[0];
  let next = CLUB_RANKS[state.clubRank + 1] || null;
  return {
    title: rank.title,
    seconds: state.clubTimeSeconds,
    nextRankSeconds: next ? Math.max(0, next.seconds - state.clubTimeSeconds) : 0
  };
};

PartyAchievementSystem.prototype.getUnlockedCount = function (player) {
  if (!player || !player.isPlayer || !player.isPlayer()) return 0;
  return Object.keys(this.getState(player).unlocked).length;
};

PartyAchievementSystem.prototype.getLeaderboardEntry = function (name, character, online) {
  while (typeof character === "string") {
    try {
      character = JSON.parse(character);
    } catch (error) {
      character = {};
    }
  }
  character = character && typeof character === "object" ? character : {};
  let storage = character.storage && typeof character.storage === "object" ? character.storage : {};
  let state = storage.partyAchievements && typeof storage.partyAchievements === "object"
    ? storage.partyAchievements
    : {};
  let seconds = Math.max(0, Math.floor(Number(state.clubTimeSeconds) || 0));
  let unlockedCount = this.__getEligibleAchievementIds({
    counters: state.counters && typeof state.counters === "object" ? state.counters : {},
    unlocked: {}
  }).size;
  let rank = CLUB_RANKS[0];
  CLUB_RANKS.forEach(function (candidate) {
    if (seconds >= candidate.seconds) rank = candidate;
  });
  return {
    name: String(name || character.name || "Unknown").slice(0, 32),
    seconds: seconds,
    clubRank: rank.title,
    unlockedCount: unlockedCount,
    totalAchievements: this.__definitions.length,
    online: online === true
  };
};

PartyAchievementSystem.prototype.createPublicLeaderboards = function (entries, limit) {
  limit = Math.max(1, Math.min(100, Number(limit) || 50));
  entries = Array.isArray(entries) ? entries.slice() : [];
  let byName = function (left, right) {
    return left.name.localeCompare(right.name, "en", { sensitivity: "base" });
  };
  let partyTime = entries.filter(function (entry) {
    return Number(entry.seconds) >= PUBLIC_PARTY_TIME_MIN_SECONDS;
  }).sort(function (left, right) {
    return right.seconds - left.seconds
      || right.unlockedCount - left.unlockedCount
      || byName(left, right);
  }).slice(0, limit);
  let achievements = entries.filter(function (entry) {
    return Number(entry.unlockedCount) >= 1;
  }).sort(function (left, right) {
    return right.unlockedCount - left.unlockedCount
      || right.seconds - left.seconds
      || byName(left, right);
  }).slice(0, limit);
  return { partyTime: partyTime, achievements: achievements };
};

PartyAchievementSystem.prototype.setTitle = function (player, requestedTitle) {
  let state = this.getState(player);
  let normalized = String(requestedTitle || "").trim().toLowerCase();
  let definition = null;
  if (normalized && normalized !== "none" && normalized !== "off") {
    definition = this.__byId.get(normalized) || this.__byTitle.get(normalized) || null;
    if (!definition) return { ok: false, message: "Unknown title. Use /achievements to see your collection." };
    if (!state.unlocked[definition.id]) return { ok: false, message: "You have not unlocked that title yet." };
  }
  state.activeTitle = definition ? definition.id : null;
  let active = this.getActiveTitle(player);
  let packet = new CreatureTitlePacket(player.getId(), active.title, active.rarity);
  player.broadcast(packet);
  player.write(packet);
  return { ok: true, message: definition ? "Active title: %s.".format(definition.title) : "Active title removed." };
};

PartyAchievementSystem.prototype.recordLavaWin = function (player) {
  this.increment(player, "lavaWins", 1);
};

PartyAchievementSystem.prototype.recordBombermanWin = function (player, mode, deaths) {
  this.increment(player, mode === "mayhem" ? "bomberMayhemWins" : "bomberEliminationWins", 1);
  if ((Number(deaths) || 0) === 0) this.increment(player, "untouchableWins", 1);
};

PartyAchievementSystem.prototype.recordLaserChairsWin = function (player) {
  this.increment(player, "laserChairsWins", 1);
};

module.exports = PartyAchievementSystem;
