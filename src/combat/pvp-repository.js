"use strict";

const { getDatabase, waitForSchema, schema } = requireModule("db");
const { and, eq, gt, gte, or } = require("drizzle-orm");

const { pvpRelations, pvpFrags, pvpPenalties } = schema;

const PvPRepository = function () {
  this.db = getDatabase();
};

PvPRepository.prototype.loadPlayer = async function (playerId, now) {
  await waitForSchema();
  let [penalties, relations, frags] = await Promise.all([
    this.db.select().from(pvpPenalties).where(eq(pvpPenalties.playerId, playerId)).limit(1),
    this.db.select().from(pvpRelations).where(and(
      or(eq(pvpRelations.attackerId, playerId), eq(pvpRelations.targetId, playerId)),
      gt(pvpRelations.retaliationExpiresAt, now)
    )),
    this.db.select({ killedAt: pvpFrags.killedAt }).from(pvpFrags).where(and(
      eq(pvpFrags.killerId, playerId),
      eq(pvpFrags.justified, false),
      gte(pvpFrags.killedAt, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))
    )),
  ]);

  return {
    penalty: penalties[0] || null,
    relations: relations,
    fragTimestamps: frags.map(function (entry) {
      // PGlite normally returns Date objects, while PostgreSQL drivers can be
      // configured to return timestamp strings. Accept both representations.
      let value = entry.killedAt instanceof Date
        ? entry.killedAt.getTime()
        : new Date(entry.killedAt).getTime();
      return Number.isFinite(value) ? value : 0;
    }).filter(function (value) { return value > 0; }),
  };
};

PvPRepository.prototype.savePenalty = async function (playerId, state) {
  await waitForSchema();
  let values = {
    playerId: playerId,
    whiteUntil: new Date(state.whiteUntil || 0),
    redUntil: new Date(state.redUntil || 0),
    blackUntil: new Date(state.blackUntil || 0),
    pzLockUntil: new Date(state.pzLockUntil || 0),
    updatedAt: new Date(),
  };

  await this.db.insert(pvpPenalties).values(values).onConflictDoUpdate({
    target: pvpPenalties.playerId,
    set: values,
  });
};

PvPRepository.prototype.saveRelation = async function (relation) {
  await waitForSchema();
  let values = {
    attackerId: relation.attackerId,
    targetId: relation.targetId,
    aggressionExpiresAt: new Date(relation.aggressionExpiresAt),
    retaliationExpiresAt: new Date(relation.retaliationExpiresAt),
    justifiedAtStart: relation.justifiedAtStart,
    updatedAt: new Date(),
  };

  await this.db.insert(pvpRelations).values(values).onConflictDoUpdate({
    target: [pvpRelations.attackerId, pvpRelations.targetId],
    set: values,
  });
};

PvPRepository.prototype.recordDeath = async function (event, state) {
  await waitForSchema();
  return this.db.transaction(async function (tx) {
    let inserted = await tx.insert(pvpFrags).values({
      eventId: event.eventId,
      killerId: event.killerId,
      victimId: event.victimId,
      killedAt: new Date(event.timestamp),
      justified: event.justified,
      participants: JSON.stringify(event.participants),
    }).onConflictDoNothing({ target: pvpFrags.eventId }).returning({ id: pvpFrags.id });

    if (inserted.length === 0) {
      return false;
    }

    if (state !== null) {
      let values = {
        playerId: event.killerId,
        whiteUntil: new Date(state.whiteUntil || 0),
        redUntil: new Date(state.redUntil || 0),
        blackUntil: new Date(state.blackUntil || 0),
        pzLockUntil: new Date(state.pzLockUntil || 0),
        updatedAt: new Date(),
      };
      await tx.insert(pvpPenalties).values(values).onConflictDoUpdate({
        target: pvpPenalties.playerId,
        set: values,
      });
    }

    return true;
  });
};

module.exports = PvPRepository;
