module.exports = function explosion(source, target) {
  const minDamage = 60;
  const maxDamage = 100;

  process.gameServer.world.sendDistanceEffect(
    source.position,
    target.position,
    CONST.EFFECT.PROJECTILE.FIRE
  );

  // Explosion is a 3x3 area centred on the chosen tile.
  target.position.getSquare(1).forEach(function(position) {
    let tile = process.gameServer.world.getTileFromWorldPosition(position);

    if (tile === null || tile.isBlockSolid()) {
      return;
    }

    process.gameServer.world.sendMagicEffect(position, CONST.EFFECT.MAGIC.EXPLOSIONAREA);

    tile.monsters.forEach(function(monster) {
      process.gameServer.world.__damageEntity(
        source,
        monster,
        Number.prototype.random(minDamage, maxDamage),
        CONST.COLOR.ORANGE
      );
    });

    tile.players.forEach(function(player) {
      if (player === source) {
        return;
      }

      process.gameServer.world.__damageEntity(
        source,
        player,
        Number.prototype.random(minDamage, maxDamage),
        CONST.COLOR.ORANGE
      );
    });
  });

  return true;
};
