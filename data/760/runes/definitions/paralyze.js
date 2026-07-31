const Condition = requireModule("combat/condition");

module.exports = function paralyze(source, target) {
  let affected = false;

  target.monsters.forEach(function(monster) {
    monster.addCondition(Condition.prototype.PARALYZED, 6, 1000, null);
    affected = true;
  });

  target.players.forEach(function(player) {
    if (player === source) {
      return;
    }

    if (!process.gameServer.world.combatHandler.canAttack(source, player, true)) {
      return;
    }

    player.addCondition(Condition.prototype.PARALYZED, 6, 1000, null);
    affected = true;
  });

  if (!affected) {
    return false;
  }

  process.gameServer.world.sendDistanceEffect(
    source.position,
    target.position,
    CONST.EFFECT.PROJECTILE.ENERGY
  );
  process.gameServer.world.sendMagicEffect(target.position, CONST.EFFECT.MAGIC.YELLOW_RINGS);

  return true;
};
