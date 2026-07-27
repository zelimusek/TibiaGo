module.exports = function energyBomb(source, target) {
  // Energy bomb uses the same 3x3 layout as fire bomb, but creates regular
  // energy fields. Item 1495 decays on its own after its configured duration.
  const square = target.position.getSquare(1);

  process.gameServer.world.sendDistanceEffect(
    source.position,
    target.position,
    CONST.EFFECT.PROJECTILE.ENERGY
  );

  square.forEach(function(position) {
    const tile = process.gameServer.world.getTileFromWorldPosition(position);

    if (tile === null) {
      return;
    }

    tile.addTopThing(process.gameServer.database.createThing(1495));

    // Like fire bomb, affect a creature already standing in the new field.
    tile.players.forEach(function(creature) {
      tile.itemStack.applyFieldDamage(creature);
    });
    tile.monsters.forEach(function(creature) {
      tile.itemStack.applyFieldDamage(creature);
    });
  });

  return true;
};
