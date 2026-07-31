module.exports = function suddenDeath(source, target) {

  /*
   * function suddenDeath
   * Code that handles the sudden death rune
   * SD rune deals high death damage to a single target
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
  process.gameServer.world.sendDistanceEffect(source.position, target.position, CONST.EFFECT.PROJECTILE.DEATH);

  // Send magic effect at the target position
  process.gameServer.world.sendMagicEffect(target.position, CONST.EFFECT.MAGIC.MORTAREA);

  // Calculate random damage between 150-200 (typical SD damage in Tibia 7.4)
  let minDamage = 150;
  let maxDamage = 200;

  targets.forEach(function (creature) {
    let damage = Number.prototype.random(minDamage, maxDamage);
    process.gameServer.world.__damageEntity(source, creature, damage, CONST.COLOR.WHITE);
  });

  return true;

}
