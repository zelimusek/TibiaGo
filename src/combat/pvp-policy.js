"use strict";

const PvPPolicy = function () {
  /*
   * Server-authoritative rules for player versus player combat. Every damage
   * path must ultimately pass through this policy so modified clients cannot
   * bypass vocation or zone restrictions by sending packets directly.
   */
};

PvPPolicy.prototype.MESSAGES = {
  SELF: "You may not attack yourself.",
  DEAD: "You may not attack this player.",
  NO_VOCATION: "You need to choose a vocation before attacking players.",
  PROTECTION_ZONE: "You may not attack players in a protection zone.",
  NO_PVP_ZONE: "You may not attack players in a no-PvP zone."
};

PvPPolicy.prototype.__allowed = function () {
  return { allowed: true, message: null };
};

PvPPolicy.prototype.__denied = function (message) {
  return { allowed: false, message: message };
};

PvPPolicy.prototype.__isPlayer = function (creature) {
  return Boolean(creature && creature.isPlayer && creature.isPlayer());
};

PvPPolicy.prototype.__isAdministrator = function (player) {
  let role = player.getProperty(CONST.PROPERTIES.ROLE);
  return role >= CONST.ROLES.GAMEMASTER;
};

PvPPolicy.prototype.__getTile = function (creature) {
  return creature && creature.getTile ? creature.getTile() : null;
};

PvPPolicy.prototype.checkAttack = function (source, target) {
  // PvE and environmental damage are outside the PvP policy.
  if (!this.__isPlayer(source) || !this.__isPlayer(target)) {
    return this.__allowed();
  }

  if (source === target) {
    return this.__denied(this.MESSAGES.SELF);
  }

  if (target.isDead || (target.isZeroHealth && target.isZeroHealth())) {
    return this.__denied(this.MESSAGES.DEAD);
  }

  let sourceTile = this.__getTile(source);
  let targetTile = this.__getTile(target);

  if (
    (sourceTile && sourceTile.isProtectionZone && sourceTile.isProtectionZone()) ||
    (targetTile && targetTile.isProtectionZone && targetTile.isProtectionZone())
  ) {
    return this.__denied(this.MESSAGES.PROTECTION_ZONE);
  }

  if (
    (sourceTile && sourceTile.isNoPvPZone && sourceTile.isNoPvPZone()) ||
    (targetTile && targetTile.isNoPvPZone && targetTile.isNoPvPZone())
  ) {
    return this.__denied(this.MESSAGES.NO_PVP_ZONE);
  }

  // GOD and Gamemaster characters frequently keep the internal NONE vocation
  // and must remain able to administrate and test combat.
  if (
    !this.__isAdministrator(source) &&
    source.getProperty(CONST.PROPERTIES.VOCATION) === CONST.VOCATION.NONE
  ) {
    return this.__denied(this.MESSAGES.NO_VOCATION);
  }

  return this.__allowed();
};

PvPPolicy.prototype.canAttack = function (source, target, notify) {
  let result = this.checkAttack(source, target);

  if (
    !result.allowed &&
    notify &&
    source &&
    source.sendCancelMessage
  ) {
    source.sendCancelMessage(result.message);
  }

  return result.allowed;
};

PvPPolicy.prototype.getDamageMultiplier = function () {
  let configured = CONFIG.COMBAT && Number(CONFIG.COMBAT.PVP_DAMAGE_MULTIPLIER);
  return Number.isFinite(configured) && configured >= 0 ? configured : 0.5;
};

PvPPolicy.prototype.scaleDamage = function (source, target, amount) {
  if (!this.__isPlayer(source) || !this.__isPlayer(target)) {
    return amount;
  }

  if (amount <= 0) {
    return 0;
  }

  return Math.max(1, Math.floor(amount * this.getDamageMultiplier()));
};

module.exports = PvPPolicy;
