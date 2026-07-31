"use strict";

/*
 * All classic PvP limits and durations live in this module. Keeping them in
 * one place avoids subtle differences between melee, runes, fields, logout
 * and death handling.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

module.exports = Object.freeze({
  SKULL: Object.freeze({
    NONE: 0,
    YELLOW: 1,
    WHITE: 2,
    RED: 3,
    BLACK: 4,
  }),
  AGGRESSION_MS: 60 * 1000,
  SELF_DEFENSE_MS: 60 * 1000,
  UNJUSTIFIED_KILL_LOCK_MS: 15 * 60 * 1000,
  RED_SKULL_DURATION_MS: 30 * DAY_MS,
  BLACK_SKULL_DURATION_MS: 15 * DAY_MS,
  BLACK_SKULL_DAMAGE_TAKEN_MULTIPLIER: 1.3,
  PARTICIPATION_MS: 15 * 60 * 1000,
  FRAG_WINDOWS: Object.freeze([
    Object.freeze({ windowMs: DAY_MS, red: 3, black: 6 }),
    Object.freeze({ windowMs: 7 * DAY_MS, red: 5, black: 10 }),
    Object.freeze({ windowMs: 30 * DAY_MS, red: 10, black: 20 }),
  ]),
  PARTY_FRIENDLY_FIRE: true,
});
