module.exports = function heavyMagicMissile(source, target) {

  /*
   * function heavyMagicMissile
   * Code that handles the heavy magic missile rune
   * HMM rune deals energy damage to a single target
   */

  let targets = Array.from(target.monsters);

  target.players.forEach(function (player) {
    if (
      player !== source &&
      process.gameServer.world.combatHandler.canAttack(source, player, true)
    ) {
      targets.push(player);
    }
  });

  // Do not show effects or consume a charge when no legal target exists.
  if (targets.length === 0) {
    return false;
  }

  // Send distance effect from source to target
  process.gameServer.world.sendDistanceEffect(source.position, target.position, CONST.EFFECT.PROJECTILE.ENERGY);

  // Send magic effect at the target position
  process.gameServer.world.sendMagicEffect(target.position, CONST.EFFECT.MAGIC.ENERGYHIT);

  // Calculate random damage between 40-60 (typical HMM damage in Tibia 7.4)
  let minDamage = 40;
  let maxDamage = 60;

  targets.forEach(function (creature) {
    let damage = Number.prototype.random(minDamage, maxDamage);
    process.gameServer.world.__damageEntity(source, creature, damage, CONST.COLOR.LIGHTBLUE);
  });

  return true;

}
