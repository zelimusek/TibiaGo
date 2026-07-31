"use strict";

const { pgTable, serial, integer, boolean, varchar, text, timestamp, index, uniqueIndex } = require("drizzle-orm/pg-core");

/**
 * Schema definition for the accounts table
 * Stores user accounts and their character data
 */
const accounts = pgTable(
    "accounts",
    {
        id: serial("id").primaryKey(),
        account: varchar("account", { length: 32 }).notNull(),
        hash: varchar("hash", { length: 60 }).notNull(),
        name: varchar("name", { length: 32 }).notNull(),
        character: text("character").notNull(), // JSON stored as text
        createdAt: timestamp("created_at").defaultNow(),
        updatedAt: timestamp("updated_at").defaultNow(),
    },
    (table) => ({
        accountNameUnique: uniqueIndex("account_name_unique").on(table.account, table.name),
    })
);

const pvpRelations = pgTable(
    "pvp_relations",
    {
        id: serial("id").primaryKey(),
        attackerId: integer("attacker_id").notNull(),
        targetId: integer("target_id").notNull(),
        aggressionExpiresAt: timestamp("aggression_expires_at").notNull(),
        retaliationExpiresAt: timestamp("retaliation_expires_at").notNull(),
        justifiedAtStart: boolean("justified_at_start").notNull().default(false),
        updatedAt: timestamp("updated_at").defaultNow(),
    },
    (table) => ({
        attackerTargetUnique: uniqueIndex("pvp_relations_attacker_target_unique").on(table.attackerId, table.targetId),
        attackerExpiryIndex: index("pvp_relations_attacker_expiry_idx").on(table.attackerId, table.retaliationExpiresAt),
        targetExpiryIndex: index("pvp_relations_target_expiry_idx").on(table.targetId, table.retaliationExpiresAt),
    })
);

const pvpFrags = pgTable(
    "pvp_frags",
    {
        id: serial("id").primaryKey(),
        eventId: varchar("event_id", { length: 96 }).notNull(),
        killerId: integer("killer_id").notNull(),
        victimId: integer("victim_id").notNull(),
        killedAt: timestamp("killed_at").notNull(),
        justified: boolean("justified").notNull(),
        participants: text("participants").notNull(),
    },
    (table) => ({
        eventUnique: uniqueIndex("pvp_frags_event_unique").on(table.eventId),
        killerTimeIndex: index("pvp_frags_killer_time_idx").on(table.killerId, table.killedAt),
    })
);

const pvpPenalties = pgTable("pvp_penalties", {
    playerId: integer("player_id").primaryKey(),
    whiteUntil: timestamp("white_until").notNull(),
    redUntil: timestamp("red_until").notNull(),
    blackUntil: timestamp("black_until").notNull(),
    pzLockUntil: timestamp("pz_lock_until").notNull(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

module.exports = { accounts, pvpRelations, pvpFrags, pvpPenalties };
