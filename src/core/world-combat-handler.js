"use strict";

const PvPPolicy = requireModule("combat/pvp-policy");

const CombatHandler = function () {

  /*
   * Class CombatHandler
   * Wrapper for all combat related functions
  */

  this.pvpPolicy = new PvPPolicy();

}

CombatHandler.prototype.canAttack = function (source, target, notify) {
  return this.pvpPolicy.canAttack(source, target, notify);
};

CombatHandler.prototype.scalePvPDamage = function (source, target, amount) {
  return this.pvpPolicy.scaleDamage(source, target, amount);
};

CombatHandler.prototype.handleCombat = function (source) {

  /*
   * Function CombatHandler.handleCombat
   * Handles combat between a creature and its target
   */

  // Reference the target
  let target = source.getTarget();

  if (!target) {
    return;
  }

  // Revalidate on every attack tick. A selected player may have entered a
  // protection/no-PvP zone since the target packet was accepted.
  if (!this.canAttack(source, target, true)) {
    if (source.isPlayer && source.isPlayer() && source.actionHandler) {
      source.actionHandler.targetHandler.setTarget(null);
    }
    return;
  }

  // Validate ranged ammunition before calculating damage or granting skill
  // advances. Throwing weapons are accepted by isAmmunitionEquipped().
  if (source.isDistanceWeaponEquipped() && !source.isAmmunitionEquipped()) {
    return;
  }

  // Calculate the damage
  let damage = source.calculateDamage();
  let defense = target.calculateDefense();

  // Get the unmitigated damage clamped
  let unmitigatedDamage = (damage - defense).clamp(0, target.getProperty(CONST.PROPERTIES.HEALTH));

  // Handle skill advances
  if (source.isPlayer()) {
    source.checkSkillAdvance(unmitigatedDamage > 0);
  }

  if (target.isPlayer()) {
    target.checkDefensiveSkillAdvance();
  }

  // If the attacker has a distance weapon equipped
  if (source.isDistanceWeaponEquipped()) {
    this.handleDistanceCombat(source, target);

  }

  // If there is no damage send a block poff effect
  if (unmitigatedDamage < 0) {
    return gameServer.world.sendMagicEffect(target.position, CONST.EFFECT.MAGIC.POFF);
  }

  // Precisely zero
  if (unmitigatedDamage === 0) {
    return gameServer.world.sendMagicEffect(target.position, CONST.EFFECT.MAGIC.BLOCKHIT);
  }

  // Blood effect when damage is dealt (effect ID 1)
  gameServer.world.sendMagicEffect(target.position, 1);

  // Remove health from target using the actual calculated damage
  return target.decreaseHealth(source, unmitigatedDamage);

}

CombatHandler.prototype.handleDistanceCombat = function (source, target) {

  /*
   * Function CombatHandler.handleDistanceCombat
   * Handles the distance combat
   */

  // Consume the ammunition
  let ammo = source.consumeAmmunition();
  let projectile = ammo;

  // Throwing weapons carry their own projectile information and do not use a
  // separate quiver stack.
  if (projectile === null && source.containerManager && source.containerManager.equipment) {
    projectile = source.containerManager.equipment.getDistanceWeapon();
  }

  // Write a distance effect
  if (projectile !== null) {
    gameServer.world.sendDistanceEffect(
      source.position,
      target.position,
      projectile.getShootType()
    );
  }

}

CombatHandler.prototype.applyEnvironmentalDamage = function (target, amount, color, source) {

  /*
   * Function CombatHandler.applyEnvironmentalDamage
   * Applies environmental damage from the gameworld (fire, energy, poison)
   */

  // Make sure to lock the player in combat
  if (target.isPlayer()) {
    target.combatLock.activate();
  }

  // Decrease the health
  target.decreaseHealth(source || null, amount, color);

}

module.exports = CombatHandler;
