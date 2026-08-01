"use strict";

const assert = require("assert");
require("../require");

const PvPConfig = requireModule("combat/pvp-config");
const PvPManager = requireModule("combat/pvp-manager");
const ContainerManager = requireModule("containers/container-manager");
const GenericLock = requireModule("utils/generic-lock");

const DAY = 24 * 60 * 60 * 1000;
let nextPlayerId = 1;

function combatLock() {
  return {
    seconds: 0,
    locked: false,
    activate(seconds) {
      this.seconds = Math.max(this.seconds, seconds || 3);
      this.locked = true;
    },
    unlock() { this.locked = false; },
    isLocked() { return this.locked; }
  };
}

function player(name) {
  return {
    accountId: nextPlayerId++,
    name: name,
    combatLock: combatLock(),
    messages: [],
    isPlayer() { return true; },
    getProperty(property) {
      return property === CONST.PROPERTIES.NAME ? this.name : null;
    },
    sendCancelMessage(message) { this.messages.push(message); }
  };
}

function MemoryRepository(snapshot) {
  this.snapshot = snapshot || null;
  this.relations = [];
  this.penalties = [];
  this.deaths = [];
  this.eventIds = new Set();
}

MemoryRepository.prototype.loadPlayer = async function () {
  return this.snapshot || { penalty: null, relations: [], fragTimestamps: [] };
};
MemoryRepository.prototype.saveRelation = async function (relation) {
  this.relations.push(Object.assign({}, relation));
};
MemoryRepository.prototype.savePenalty = async function (playerId, state) {
  this.penalties.push({ playerId: playerId, state: Object.assign({}, state) });
};
MemoryRepository.prototype.deleteRelationsForPlayer = async function (playerId) {
  this.relations = this.relations.filter(function (relation) {
    return relation.attackerId !== playerId && relation.targetId !== playerId;
  });
};
MemoryRepository.prototype.recordDeath = async function (event) {
  if (this.eventIds.has(event.eventId)) return false;
  this.eventIds.add(event.eventId);
  this.deaths.push(Object.assign({}, event));
  return true;
};

function kill(manager, killer, victim, now) {
  manager.recordDamage(killer, victim, now);
  return manager.handlePlayerDeath(victim, killer, now);
}

async function run() {
  let now = Date.UTC(2026, 6, 31, 12, 0, 0);
  let repository = new MemoryRepository();
  let manager = new PvPManager(repository);
  let attacker = player("Attacker");
  let victim = player("Victim");
  let witness = player("Witness");

  // Neutral aggression: white skull, 60 second PZ lock and self defence.
  assert.strictEqual(manager.registerAggression(attacker, victim, now), true);
  assert.strictEqual(manager.getGlobalSkull(attacker, now), PvPConfig.SKULL.WHITE);
  assert.strictEqual(manager.isPzLocked(attacker, now + 59_999), true);
  assert.strictEqual(manager.isJustifiedAttack(victim, attacker, now + 1), true);

  // A legal retaliation is yellow only to the relevant observer.
  manager.registerAggression(victim, attacker, now + 1);
  assert.strictEqual(manager.getSkullFor(attacker, victim, now + 2), PvPConfig.SKULL.YELLOW);
  assert.strictEqual(manager.getSkullFor(witness, victim, now + 2), PvPConfig.SKULL.NONE);

  // Any third party may attack a white skull, but its yellow marker remains relational.
  manager.registerAggression(witness, attacker, now + 3);
  assert.strictEqual(manager.isJustifiedAttack(witness, attacker, now + 4), true);
  assert.strictEqual(manager.getSkullFor(attacker, witness, now + 4), PvPConfig.SKULL.YELLOW);
  assert.strictEqual(manager.getSkullFor(victim, witness, now + 4), PvPConfig.SKULL.NONE);

  // Yellow skull cannot disappear before the legal attacker's combat lock.
  // Once that lock ends, the already expired relation is removed normally.
  assert.strictEqual(
    manager.getSkullFor(attacker, witness, now + PvPConfig.SELF_DEFENSE_MS + 4),
    PvPConfig.SKULL.YELLOW
  );
  witness.combatLock.locked = false;
  assert.strictEqual(
    manager.getSkullFor(attacker, witness, now + PvPConfig.SELF_DEFENSE_MS + 5),
    PvPConfig.SKULL.NONE
  );

  // Refresh and expiry use the latest aggressive action.
  manager.registerAggression(attacker, victim, now + 30_000);
  assert.strictEqual(manager.isPzLocked(attacker, now + 89_999), true);
  assert.strictEqual(manager.isPzLocked(attacker, now + 90_001), false);
  assert.strictEqual(manager.getGlobalSkull(attacker, now + 90_001), PvPConfig.SKULL.NONE);

  // Death ends combat immediately and persists a zero PZ lock. Pair-specific
  // relations involving the dead player are removed before a fast reconnect.
  let dyingPlayer = player("DyingPlayer");
  let deathOpponent = player("DeathOpponent");
  manager.registerAggression(dyingPlayer, deathOpponent, now + 100_000);
  assert.strictEqual(manager.isPzLocked(dyingPlayer, now + 100_001), true);
  await manager.clearCombatStateOnDeath(dyingPlayer);
  assert.strictEqual(dyingPlayer.combatLock.isLocked(), false);
  assert.strictEqual(manager.isPzLocked(dyingPlayer, now + 100_001), false);
  assert.strictEqual(manager.__getRelation(dyingPlayer, deathOpponent, now + 100_001), null);
  assert.strictEqual(repository.penalties.at(-1).state.pzLockUntil, 0);

  // A slow relation write from the final hit must finish before death cleanup
  // deletes it. A reconnect started in the meantime waits for that cleanup.
  let raceRepository = new MemoryRepository();
  let releaseRelationSave = null;
  raceRepository.saveRelation = function (relation) {
    return new Promise(function (resolve) {
      releaseRelationSave = function () {
        raceRepository.relations.push(Object.assign({}, relation));
        resolve();
      };
    });
  };
  raceRepository.loadPlayer = async function (playerId) {
    let penalty = this.penalties.filter(function (entry) {
      return entry.playerId === playerId;
    }).at(-1);
    return {
      penalty: penalty ? penalty.state : null,
      relations: this.relations.filter(function (relation) {
        return relation.attackerId === playerId || relation.targetId === playerId;
      }),
      fragTimestamps: []
    };
  };
  let raceManager = new PvPManager(raceRepository);
  let racePlayer = player("RacePlayer");
  let raceOpponent = player("RaceOpponent");
  raceManager.registerAggression(racePlayer, raceOpponent, now + 110_000);
  let deathCleanup = raceManager.clearCombatStateOnDeath(racePlayer);
  let reconnectedPlayer = player("RacePlayerReconnect");
  reconnectedPlayer.accountId = racePlayer.accountId;
  let hydration = raceManager.hydratePlayer(reconnectedPlayer);
  releaseRelationSave();
  await Promise.all([deathCleanup, hydration]);
  assert.strictEqual(raceManager.isPzLocked(reconnectedPlayer, now + 110_001), false);
  assert.strictEqual(raceRepository.relations.length, 0);

  // A later short PvE/combat lock may not erase a pending PvP extension.
  let genericLock = new GenericLock();
  genericLock.__lockEvent = { remainingFrames() { return 50; } };
  genericLock.__extendedLockFrame = 100;
  genericLock.__extendLock(20);
  assert.strictEqual(genericLock.__extendedLockFrame, 100);
  genericLock.__extendLock(200);
  assert.strictEqual(genericLock.__extendedLockFrame, 150);

  // A relationship that began legally stays legal until its own relation expires.
  let legalManager = new PvPManager(null);
  let marked = player("Marked");
  let hunter = player("Hunter");
  let initialAggressor = player("InitialAggressor");
  legalManager.registerAggression(marked, initialAggressor, now);
  legalManager.registerAggression(hunter, marked, now + 59_000);
  assert.strictEqual(legalManager.isJustifiedAttack(hunter, marked, now + 60_500), true);

  // Unjustified and justified kills are classified from the relation.
  let fragManager = new PvPManager(repository);
  let murderer = player("Murderer");
  let innocent = player("Innocent");
  fragManager.registerAggression(murderer, innocent, now);
  let unjustified = kill(fragManager, murderer, innocent, now + 1_000);
  assert.strictEqual(unjustified.justified, false);
  assert.strictEqual(fragManager.getGlobalSkull(murderer, now + 1_001), PvPConfig.SKULL.WHITE);
  assert.ok(fragManager.getPzLockRemainingMs(murderer, now + 1_001) > 14 * 60 * 1000);

  let defender = player("Defender");
  let aggressor = player("Aggressor");
  let justifiedManager = new PvPManager(null);
  justifiedManager.registerAggression(aggressor, defender, now);
  let justified = kill(justifiedManager, defender, aggressor, now + 1_000);
  assert.strictEqual(justified.justified, true);

  // Rolling 24h/7d/30d red and black thresholds.
  let thresholdManager = new PvPManager(null);
  let thresholdPlayer = player("Threshold");
  let state = thresholdManager.__state(thresholdPlayer);
  state.fragTimestamps = [now - 23 * 60 * 60 * 1000, now - 2_000, now - 1_000];
  thresholdManager.__applyFragThresholds(state, now);
  assert.strictEqual(thresholdManager.getGlobalSkull(thresholdPlayer, now), PvPConfig.SKULL.RED);

  state.redUntil = 0;
  state.fragTimestamps = [1, 2, 3, 4, 5].map(function (day) { return now - day * DAY; });
  thresholdManager.__applyFragThresholds(state, now);
  assert.strictEqual(thresholdManager.getGlobalSkull(thresholdPlayer, now), PvPConfig.SKULL.RED);

  state.redUntil = 0;
  state.fragTimestamps = [2, 7, 12, 17, 22, 27, 28, 29, 29.5, 29.9].map(function (day) { return now - day * DAY; });
  thresholdManager.__applyFragThresholds(state, now);
  assert.strictEqual(thresholdManager.getGlobalSkull(thresholdPlayer, now), PvPConfig.SKULL.RED);

  state.redUntil = 0;
  state.blackUntil = 0;
  state.fragTimestamps = [1, 2, 3, 4, 5, 6].map(function (hour) { return now - hour * 60 * 60 * 1000; });
  thresholdManager.__applyFragThresholds(state, now);
  assert.strictEqual(thresholdManager.getGlobalSkull(thresholdPlayer, now), PvPConfig.SKULL.BLACK);
  assert.strictEqual(thresholdManager.getIncomingDamageMultiplier(thresholdPlayer, now), 1.3);
  assert.strictEqual(thresholdManager.shouldDropAllCarriedItems(thresholdPlayer, now), true);

  state.blackUntil = 0;
  state.fragTimestamps = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6].map(function (day) { return now - day * DAY; });
  thresholdManager.__applyFragThresholds(state, now);
  assert.strictEqual(thresholdManager.getGlobalSkull(thresholdPlayer, now), PvPConfig.SKULL.BLACK);

  state.blackUntil = 0;
  state.fragTimestamps = Array.from({ length: 20 }, function (_, index) { return now - (index + 1) * DAY; });
  thresholdManager.__applyFragThresholds(state, now);
  assert.strictEqual(thresholdManager.getGlobalSkull(thresholdPlayer, now), PvPConfig.SKULL.BLACK);

  // Owner attribution follows fields and summons to the stable player object.
  let owner = player("Owner");
  assert.strictEqual(manager.resolveResponsiblePlayer({ fieldOwner: owner }), owner);
  assert.strictEqual(manager.resolveResponsiblePlayer({ master: owner }), owner);

  // Red/black drop removes all equipment, including AoL and nested backpacks,
  // without touching the depot.
  let carried = [
    { id: 2173, count: 1, isStackable() { return false; } },
    { id: 1988, count: 1, container: { __slots: [{ id: 2148 }] }, isStackable() { return false; } }
  ];
  let slots = carried.concat(new Array(8).fill(null));
  let dropped = [];
  let managerLike = {
    equipment: {
      peekIndex(index) { return slots[index]; },
      removeIndex(index) { let item = slots[index]; slots[index] = null; return item; }
    },
    depot: { untouched: true }
  };
  ContainerManager.prototype.dropAllCarriedItems.call(managerLike, {
    container: {},
    addFirstEmpty(item) { dropped.push(item); }
  });
  assert.deepStrictEqual(dropped.map(function (item) { return item.id; }), [2173, 1988]);
  assert.strictEqual(managerLike.depot.untouched, true);

  // Restart hydration restores timers and activates logout combat lock.
  let persistedPlayer = player("Persisted");
  let persistedRepository = new MemoryRepository({
    penalty: {
      whiteUntil: new Date(now + 30_000),
      redUntil: new Date(0),
      blackUntil: new Date(0),
      pzLockUntil: new Date(now + 45_000)
    },
    relations: [],
    fragTimestamps: []
  });
  let persistedManager = new PvPManager(persistedRepository);
  let originalNow = Date.now;
  Date.now = function () { return now; };
  await persistedManager.hydratePlayer(persistedPlayer);
  Date.now = originalNow;
  assert.strictEqual(persistedManager.isPzLocked(persistedPlayer, now), true);
  assert.ok(persistedPlayer.combatLock.seconds >= 45);

  // The same death event is processed once even if a handler fires twice.
  let idempotentRepository = new MemoryRepository();
  let idempotentManager = new PvPManager(idempotentRepository);
  let idemKiller = player("IdemKiller");
  let idemVictim = player("IdemVictim");
  idempotentManager.registerAggression(idemKiller, idemVictim, now);
  assert.ok(idempotentManager.handlePlayerDeath(idemVictim, idemKiller, now + 1));
  assert.strictEqual(idempotentManager.handlePlayerDeath(idemVictim, idemKiller, now + 2), null);

  await new Promise(function (resolve) { setImmediate(resolve); });
  assert.strictEqual(idempotentRepository.deaths.length, 1);

  // Logging in a second player refreshes observer-relative skulls. Visibility
  // checks must receive the subject position, never the creature object.
  let firstOnline = player("FirstOnline");
  let secondOnline = player("SecondOnline");
  let firstPosition = { x: 100, y: 100, z: 7 };
  let secondPosition = { x: 101, y: 100, z: 7 };
  let firstSeen = [];
  let secondSeen = [];
  Object.assign(firstOnline, {
    getId() { return 1001; },
    getPosition() { return firstPosition; },
    canSee(position) { firstSeen.push(position); return true; },
    write() {}
  });
  Object.assign(secondOnline, {
    getId() { return 1002; },
    getPosition() { return secondPosition; },
    canSee(position) { secondSeen.push(position); return true; },
    write() {}
  });

  let previousGameServer = global.gameServer;
  global.gameServer = {
    world: {
      creatureHandler: {
        getConnectedPlayers() { return new Map([
          ["FirstOnline", firstOnline],
          ["SecondOnline", secondOnline]
        ]); }
      }
    }
  };
  try {
    new PvPManager(null).broadcastSkullChanges();
  } finally {
    global.gameServer = previousGameServer;
  }
  assert.strictEqual(firstSeen[0], secondPosition);
  assert.strictEqual(secondSeen[0], firstPosition);

  console.log("PASS: classic PvP relations, skulls, frags, penalties, attribution and carried-item drop.");
}

run().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
