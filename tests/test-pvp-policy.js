"use strict";

const assert = require("assert");
require("../require");

const PvPPolicy = requireModule("combat/pvp-policy");

let nextPlayerId = 1;

function tile(options) {
  options = options || {};
  return {
    accountId: nextPlayerId++,
    isProtectionZone() {
      return Boolean(options.protection);
    },
    isNoPvPZone() {
      return Boolean(options.noPvP);
    }
  };
}

function player(options) {
  options = options || {};
  return {
    vocation: options.vocation == null ? CONST.VOCATION.KNIGHT : options.vocation,
    role: options.role == null ? CONST.ROLES.NONE : options.role,
    currentTile: options.tile || tile(),
    isDead: Boolean(options.dead),
    secureMode: Boolean(options.secureMode),
    messages: [],
    isPlayer() {
      return true;
    },
    isZeroHealth() {
      return this.isDead;
    },
    getTile() {
      return this.currentTile;
    },
    getProperty(property) {
      if (property === CONST.PROPERTIES.ROLE) return this.role;
      if (property === CONST.PROPERTIES.VOCATION) return this.vocation;
      return null;
    },
    sendCancelMessage(message) {
      this.messages.push(message);
    }
  };
}

const monster = {
  isPlayer() {
    return false;
  }
};

const policy = new PvPPolicy({ repository: null });
const target = player();

const noVocation = player({ vocation: CONST.VOCATION.NONE });
assert.strictEqual(policy.canAttack(noVocation, target, true), false);
assert.deepStrictEqual(noVocation.messages, [policy.MESSAGES.NO_VOCATION]);

const god = player({ vocation: CONST.VOCATION.NONE, role: CONST.ROLES.GOD });
assert.strictEqual(policy.canAttack(god, target, true), true);
assert.deepStrictEqual(god.messages, []);

const knight = player();
assert.strictEqual(policy.canAttack(knight, target, true), true);
assert.strictEqual(policy.canAttack(knight, monster, true), true);
assert.strictEqual(policy.canAttack(knight, knight, true), false);
assert.strictEqual(knight.messages.pop(), policy.MESSAGES.SELF);

const protectionAttacker = player({ tile: tile({ protection: true }) });
assert.strictEqual(policy.canAttack(protectionAttacker, target, true), false);
assert.strictEqual(protectionAttacker.messages.pop(), policy.MESSAGES.PROTECTION_ZONE);

const protectedTarget = player({ tile: tile({ protection: true }) });
assert.strictEqual(policy.canAttack(knight, protectedTarget, true), false);
assert.strictEqual(knight.messages.pop(), policy.MESSAGES.PROTECTION_ZONE);

const noPvPTarget = player({ tile: tile({ noPvP: true }) });
assert.strictEqual(policy.canAttack(knight, noPvPTarget, true), false);
assert.strictEqual(knight.messages.pop(), policy.MESSAGES.NO_PVP_ZONE);

const deadTarget = player({ dead: true });
assert.strictEqual(policy.canAttack(knight, deadTarget, true), false);
assert.strictEqual(knight.messages.pop(), policy.MESSAGES.DEAD);

assert.strictEqual(policy.scaleDamage(knight, target, 101), 50);
assert.strictEqual(policy.scaleDamage(knight, monster, 101), 101);

CONFIG.COMBAT.PVP_DAMAGE_MULTIPLIER = 0.25;
assert.strictEqual(policy.scaleDamage(knight, target, 100), 25);

const secureKnight = player({ secureMode: true });
assert.strictEqual(policy.canAttack(secureKnight, player(), true), false);
assert.strictEqual(secureKnight.messages.pop(), policy.MESSAGES.SECURE_MODE);

console.log("PASS: server PvP policy enforces vocation, role, zone and damage rules.");
