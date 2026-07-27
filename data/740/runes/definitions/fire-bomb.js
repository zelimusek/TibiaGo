module.exports = function fireBomb(source, target) {

  // A fire bomb covers the targeted square and the eight neighbouring squares.
  // getSquare must be called on the actual target position: calling it on the
  // Position prototype produced NaN coordinates, so no fields were created.
  let square = target.position.getSquare(1);

  process.gameServer.world.sendDistanceEffect(source.position, target.position, CONST.EFFECT.PROJECTILE.FIRE);

  square.forEach(function(position) {

    let tile = process.gameServer.world.getTileFromWorldPosition(position);

    if(tile === null) {
      return;
    }

    // 1492 is the first stage of a normal, decaying fire field. 1487 does not
    // decay and would leave permanent fire on the map. Do not use the tile's
    // ground-solid flag here: the legacy map marks several ordinary floor
    // tiles with it, which reduced a 3x3 bomb to a single visible field.
    tile.addTopThing(process.gameServer.database.createThing(1492));

    // A creature already standing in the new field is affected immediately.
    // Tile.creatures exists only on occupied tiles; these getters safely
    // return empty sets on ordinary floor tiles.
    tile.players.forEach(function(creature) {
      tile.itemStack.applyFieldDamage(creature);
    });
    tile.monsters.forEach(function(creature) {
      tile.itemStack.applyFieldDamage(creature);
    });

  });

  return true;

}
