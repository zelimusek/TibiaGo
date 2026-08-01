"use strict";

const crypto = require("crypto");
const PvPConfig = requireModule("combat/pvp-config");

const PvPManager = function (repository) {
  this.repository = repository || null;
  this.__states = new Map();
  this.__relations = new Map();
  this.__participants = new Map();
  this.__processedDeaths = new Set();
  this.__lastTickSecond = -1;
  this.__visibleSkulls = new Map();
  this.__pendingPersistenceByPlayer = new Map();
  this.__pendingDeathClears = new Map();
};

PvPManager.prototype.__timestamp = function (value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  let timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

PvPManager.prototype.__id = function (player) {
  return player && Number.isInteger(player.accountId) ? player.accountId : null;
};

PvPManager.prototype.__relationKey = function (attackerId, targetId) {
  return attackerId + ":" + targetId;
};

PvPManager.prototype.__isCombatLocked = function (player) {
  return Boolean(
    player &&
    player.combatLock &&
    typeof player.combatLock.isLocked === "function" &&
    player.combatLock.isLocked()
  );
};

PvPManager.prototype.__findConnectedPlayer = function (playerId) {
  if (!global.gameServer || !gameServer.world || !gameServer.world.creatureHandler) return null;
  let players = gameServer.world.creatureHandler.getConnectedPlayers();
  if (!players || typeof players.forEach !== "function") return null;

  let match = null;
  players.forEach(function (player) {
    if (player && player.accountId === playerId) match = player;
  });
  return match;
};

PvPManager.prototype.__isRelationActive = function (relation, attacker, now) {
  if (relation === null) return false;
  if (relation.retaliationExpiresAt > now) return true;

  // A yellow skull represents an attack that was legal when this pair's
  // fight began. Keep that observer-relative marker for at least as long as
  // the attacker still has the in-fight lock, even if the nominal relation
  // timer reaches its boundary a fraction earlier.
  return relation.justifiedAtStart && this.__isCombatLocked(attacker);
};

PvPManager.prototype.__state = function (playerOrId) {
  let id = Number.isInteger(playerOrId) ? playerOrId : this.__id(playerOrId);
  if (id === null) return null;
  if (!this.__states.has(id)) {
    this.__states.set(id, {
      whiteUntil: 0,
      redUntil: 0,
      blackUntil: 0,
      pzLockUntil: 0,
      fragTimestamps: [],
    });
  }
  return this.__states.get(id);
};

PvPManager.prototype.__safePersist = function (promise) {
  if (!promise || typeof promise.catch !== "function") return;
  promise.catch(function (error) {
    console.error("PvP persistence error:", error);
  });
};

PvPManager.prototype.__trackPersistence = function (promise, playerIds) {
  let ids = Array.from(new Set((playerIds || []).filter(Number.isInteger)));
  ids.forEach(function (playerId) {
    if (!this.__pendingPersistenceByPlayer.has(playerId)) {
      this.__pendingPersistenceByPlayer.set(playerId, new Set());
    }
    this.__pendingPersistenceByPlayer.get(playerId).add(promise);
  }, this);

  let cleanup = function () {
    ids.forEach(function (playerId) {
      let pending = this.__pendingPersistenceByPlayer.get(playerId);
      if (!pending) return;
      pending.delete(promise);
      if (pending.size === 0) this.__pendingPersistenceByPlayer.delete(playerId);
    }, this);
  }.bind(this);
  promise.then(cleanup, cleanup);
  this.__safePersist(promise);
  return promise;
};

PvPManager.prototype.hydratePlayer = async function (player) {
  let id = this.__id(player);
  if (id === null || this.repository === null) return;

  // An immediate reconnect after acknowledging the death modal must not race
  // the asynchronous penalty cleanup from the previous player instance.
  let pendingDeathClear = this.__pendingDeathClears.get(id);
  if (pendingDeathClear) await pendingDeathClear;

  let loaded = await this.repository.loadPlayer(id, new Date());
  let penalty = loaded.penalty || {};
  this.__states.set(id, {
    whiteUntil: this.__timestamp(penalty.whiteUntil),
    redUntil: this.__timestamp(penalty.redUntil),
    blackUntil: this.__timestamp(penalty.blackUntil),
    pzLockUntil: this.__timestamp(penalty.pzLockUntil),
    fragTimestamps: loaded.fragTimestamps || [],
  });
  loaded.relations.forEach(function (entry) {
    this.__relations.set(this.__relationKey(entry.attackerId, entry.targetId), {
      attackerId: entry.attackerId,
      targetId: entry.targetId,
      aggressionExpiresAt: this.__timestamp(entry.aggressionExpiresAt),
      retaliationExpiresAt: this.__timestamp(entry.retaliationExpiresAt),
      justifiedAtStart: entry.justifiedAtStart,
    });
  }, this);

  let remaining = this.getPzLockRemainingMs(player);
  if (remaining > 0 && player.combatLock) {
    player.combatLock.activate(Math.ceil(remaining / 1000));
  }
};

PvPManager.prototype.clearCombatStateOnDeath = function (player) {
  let playerId = this.__id(player);
  if (playerId === null) return Promise.resolve();

  let state = this.__state(playerId);
  state.pzLockUntil = 0;

  // Death ends every pair-specific fight involving this character. Global
  // red/black/white penalties remain untouched, but yellow/self-defence
  // relations must not reappear after the temple respawn.
  this.__relations.forEach(function (relation, key) {
    if (relation.attackerId === playerId || relation.targetId === playerId) {
      this.__relations.delete(key);
    }
  }, this);

  if (player.combatLock && typeof player.combatLock.unlock === "function") {
    player.combatLock.unlock();
  }

  let earlierWrites = Array.from(this.__pendingPersistenceByPlayer.get(playerId) || []);
  let pending = Promise.all(earlierWrites.map(function (promise) {
    // The original write already reports its own error. Death cleanup still
    // has to run afterwards so a failed stale write cannot preserve combat.
    return promise.catch(function () { return null; });
  })).then(function () {
    if (!this.repository) return [];
    let operations = [this.repository.savePenalty(playerId, state)];
    if (typeof this.repository.deleteRelationsForPlayer === "function") {
      operations.push(this.repository.deleteRelationsForPlayer(playerId));
    }
    return Promise.all(operations);
  }.bind(this));
  this.__pendingDeathClears.set(playerId, pending);
  let clearPending = function () {
    if (this.__pendingDeathClears.get(playerId) === pending) {
      this.__pendingDeathClears.delete(playerId);
    }
  }.bind(this);
  pending.then(clearPending, clearPending);
  this.__safePersist(pending);
  this.broadcastSkullChanges();
  return pending;
};

PvPManager.prototype.getGlobalSkull = function (player, now) {
  now = now || Date.now();
  let state = this.__state(player);
  if (state === null) return PvPConfig.SKULL.NONE;
  if (state.blackUntil > now) return PvPConfig.SKULL.BLACK;
  if (state.redUntil > now) return PvPConfig.SKULL.RED;
  if (state.whiteUntil > now) return PvPConfig.SKULL.WHITE;
  return PvPConfig.SKULL.NONE;
};

PvPManager.prototype.__getRelation = function (attacker, target, now) {
  let attackerId = Number.isInteger(attacker) ? attacker : this.__id(attacker);
  let targetId = Number.isInteger(target) ? target : this.__id(target);
  if (attackerId === null || targetId === null) return null;
  let key = this.__relationKey(attackerId, targetId);
  let relation = this.__relations.get(key) || null;
  let attackerPlayer = Number.isInteger(attacker)
    ? this.__findConnectedPlayer(attackerId)
    : attacker;
  if (relation && !this.__isRelationActive(relation, attackerPlayer, now || Date.now())) {
    this.__relations.delete(key);
    return null;
  }
  return relation;
};

PvPManager.prototype.hasSelfDefenseRight = function (player, against, now) {
  let relation = this.__getRelation(against, player, now);
  return relation !== null;
};

PvPManager.prototype.isJustifiedAttack = function (attacker, target, now) {
  now = now || Date.now();
  let skull = this.getGlobalSkull(target, now);
  if (skull === PvPConfig.SKULL.WHITE || skull === PvPConfig.SKULL.RED || skull === PvPConfig.SKULL.BLACK) {
    return true;
  }
  if (this.hasSelfDefenseRight(attacker, target, now)) return true;

  // Preserve the legal status established at the beginning of this pair's
  // fight. A white skull expiring one second before the final hit must not
  // turn an otherwise justified kill into an unjustified frag.
  let activeAttack = this.__getRelation(attacker, target, now);
  return Boolean(
    activeAttack &&
    activeAttack.justifiedAtStart
  );
};

PvPManager.prototype.getSkullFor = function (observer, subject, now) {
  now = now || Date.now();
  let globalSkull = this.getGlobalSkull(subject, now);
  if (globalSkull !== PvPConfig.SKULL.NONE) return globalSkull;

  // A legal attacker of a marked player is yellow only for that marked player.
  let relation = this.__getRelation(subject, observer, now);
  if (relation && relation.justifiedAtStart) {
    return PvPConfig.SKULL.YELLOW;
  }
  return PvPConfig.SKULL.NONE;
};

PvPManager.prototype.registerAggression = function (attacker, target, now) {
  now = now || Date.now();
  let attackerId = this.__id(attacker);
  let targetId = this.__id(target);
  if (attackerId === null || targetId === null || attackerId === targetId) return false;

  let justified = this.isJustifiedAttack(attacker, target, now);
  let relation = {
    attackerId: attackerId,
    targetId: targetId,
    aggressionExpiresAt: now + PvPConfig.AGGRESSION_MS,
    retaliationExpiresAt: now + PvPConfig.SELF_DEFENSE_MS,
    justifiedAtStart: justified,
  };
  this.__relations.set(this.__relationKey(attackerId, targetId), relation);

  let state = this.__state(attackerId);
  state.pzLockUntil = Math.max(state.pzLockUntil, now + PvPConfig.AGGRESSION_MS);
  if (!justified) {
    state.whiteUntil = Math.max(state.whiteUntil, now + PvPConfig.AGGRESSION_MS);
  }

  if (attacker.combatLock) attacker.combatLock.activate(PvPConfig.AGGRESSION_MS / 1000);
  if (target.combatLock) target.combatLock.activate(PvPConfig.AGGRESSION_MS / 1000);
  if (this.repository) {
    this.__trackPersistence(
      this.repository.saveRelation(relation),
      [attackerId, targetId]
    );
    this.__trackPersistence(
      this.repository.savePenalty(attackerId, state),
      [attackerId]
    );
  }
  this.broadcastSkullChanges(attacker, target);
  return true;
};

PvPManager.prototype.recordDamage = function (attacker, victim, now) {
  now = now || Date.now();
  let attackerId = this.__id(attacker);
  let victimId = this.__id(victim);
  if (attackerId === null || victimId === null || attackerId === victimId) return;
  if (!this.__participants.has(victimId)) this.__participants.set(victimId, new Map());
  this.__participants.get(victimId).set(attackerId, now);
};

PvPManager.prototype.resolveResponsiblePlayer = function (source) {
  let current = source;
  let visited = new Set();
  while (current && !visited.has(current)) {
    visited.add(current);
    if (current.isPlayer && current.isPlayer()) return current;

    if (
      Number.isInteger(current.ownerPlayerId) &&
      global.gameServer && gameServer.world && gameServer.world.creatureHandler
    ) {
      let owner = null;
      gameServer.world.creatureHandler.getConnectedPlayers().forEach(function (player) {
        if (player.accountId === current.ownerPlayerId) owner = player;
      });
      if (owner !== null) return owner;
    }

    current = current.master || current.fieldOwner || current.ownerPlayer || null;
  }
  return null;
};

PvPManager.prototype.getPzLockRemainingMs = function (player, now) {
  now = now || Date.now();
  let state = this.__state(player);
  return state === null ? 0 : Math.max(0, state.pzLockUntil - now);
};

PvPManager.prototype.isPzLocked = function (player, now) {
  return this.getPzLockRemainingMs(player, now) > 0;
};

PvPManager.prototype.getIncomingDamageMultiplier = function (target, now) {
  return this.getGlobalSkull(target, now) === PvPConfig.SKULL.BLACK
    ? PvPConfig.BLACK_SKULL_DAMAGE_TAKEN_MULTIPLIER
    : 1;
};

PvPManager.prototype.__applyFragThresholds = function (state, now) {
  state.fragTimestamps = state.fragTimestamps.filter(function (timestamp) {
    return timestamp >= now - 30 * 24 * 60 * 60 * 1000;
  });
  let black = PvPConfig.FRAG_WINDOWS.some(function (rule) {
    return state.fragTimestamps.filter(function (timestamp) { return timestamp >= now - rule.windowMs; }).length >= rule.black;
  });
  let red = PvPConfig.FRAG_WINDOWS.some(function (rule) {
    return state.fragTimestamps.filter(function (timestamp) { return timestamp >= now - rule.windowMs; }).length >= rule.red;
  });
  if (black) {
    state.blackUntil = Math.max(state.blackUntil, now + PvPConfig.BLACK_SKULL_DURATION_MS);
    state.redUntil = 0;
  } else if (red) {
    state.redUntil = Math.max(state.redUntil, now + PvPConfig.RED_SKULL_DURATION_MS);
  }
};

PvPManager.prototype.handlePlayerDeath = function (victim, source, now) {
  now = now || Date.now();
  let killer = this.resolveResponsiblePlayer(source);
  let victimId = this.__id(victim);
  let killerId = this.__id(killer);
  if (victimId === null || killerId === null || victimId === killerId) return null;

  let eventId = victim.__pvpDeathEventId || crypto.randomUUID();
  victim.__pvpDeathEventId = eventId;
  if (this.__processedDeaths.has(eventId)) return null;
  this.__processedDeaths.add(eventId);

  let justified = this.isJustifiedAttack(killer, victim, now);
  let participants = [];
  let damage = this.__participants.get(victimId) || new Map();
  damage.forEach(function (timestamp, playerId) {
    if (timestamp >= now - PvPConfig.PARTICIPATION_MS) participants.push(playerId);
  });
  if (participants.indexOf(killerId) === -1) participants.push(killerId);
  this.__participants.delete(victimId);

  let state = this.__state(killerId);
  if (!justified) {
    state.fragTimestamps.push(now);
    state.whiteUntil = Math.max(state.whiteUntil, now + PvPConfig.UNJUSTIFIED_KILL_LOCK_MS);
    state.pzLockUntil = Math.max(state.pzLockUntil, now + PvPConfig.UNJUSTIFIED_KILL_LOCK_MS);
    this.__applyFragThresholds(state, now);
    if (killer.combatLock) killer.combatLock.activate(PvPConfig.UNJUSTIFIED_KILL_LOCK_MS / 1000);
  }

  if (killer.sendCancelMessage) {
    killer.sendCancelMessage(
      justified
        ? "The kill was justified."
        : "Warning! The murder of " + victim.getProperty(CONST.PROPERTIES.NAME) + " was not justified."
    );
  }

  let event = {
    eventId: eventId,
    killerId: killerId,
    victimId: victimId,
    timestamp: now,
    justified: justified,
    participants: participants,
  };
  if (this.repository) {
    this.__trackPersistence(
      this.repository.recordDeath(event, justified ? null : state),
      [killerId, victimId]
    );
  }
  this.broadcastSkullChanges(killer, victim);
  return event;
};

PvPManager.prototype.shouldDropAllCarriedItems = function (player, now) {
  let skull = this.getGlobalSkull(player, now);
  return skull === PvPConfig.SKULL.RED || skull === PvPConfig.SKULL.BLACK;
};

PvPManager.prototype.broadcastSkullChanges = function () {
  if (!global.gameServer || !gameServer.world || !gameServer.world.creatureHandler) return;
  let players = gameServer.world.creatureHandler.getConnectedPlayers();
  if (!players) return;
  const { CreatureSkullPacket } = requireModule("network/protocol");
  let connectedIds = new Set();
  players.forEach(function (player) { connectedIds.add(player.getId()); });

  players.forEach(function (observer) {
    players.forEach(function (subject) {
      if (observer === subject || observer.canSee(subject.getPosition())) {
        let key = observer.getId() + ":" + subject.getId();
        let skull = this.getSkullFor(observer, subject);
        if (this.__visibleSkulls.get(key) !== skull) {
          this.__visibleSkulls.set(key, skull);
          observer.write(new CreatureSkullPacket(subject.getId(), skull));
        }
      }
    }, this);
  }, this);

  this.__visibleSkulls.forEach(function (_, key) {
    let ids = key.split(":").map(Number);
    if (!connectedIds.has(ids[0]) || !connectedIds.has(ids[1])) {
      this.__visibleSkulls.delete(key);
    }
  }, this);
};

PvPManager.prototype.tick = function (now) {
  now = now || Date.now();
  let second = Math.floor(now / 1000);
  if (second === this.__lastTickSecond) return;
  this.__lastTickSecond = second;

  this.__relations.forEach(function (relation, key) {
    let attacker = this.__findConnectedPlayer(relation.attackerId);
    if (!this.__isRelationActive(relation, attacker, now)) this.__relations.delete(key);
  }, this);

  this.__participants.forEach(function (participants, victimId) {
    participants.forEach(function (timestamp, playerId) {
      if (timestamp < now - PvPConfig.PARTICIPATION_MS) participants.delete(playerId);
    });
    if (participants.size === 0) this.__participants.delete(victimId);
  }, this);

  // Skull visibility can be observer-relative and can expire without another
  // combat packet, so refresh the small marker packet once per second.
  this.broadcastSkullChanges();
};

module.exports = PvPManager;
